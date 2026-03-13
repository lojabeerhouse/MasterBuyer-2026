import React, { useState, useMemo } from 'react';
import { PurchaseOrder, PurchaseOrderStatus, Supplier } from '../types';
import {
  CalendarDays, ChevronDown, ChevronUp, Truck, Package,
  CheckCircle, XCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight
} from 'lucide-react';

interface ScheduleProps {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
}

// ── helpers ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  draft:               'bg-slate-700 border-slate-600 text-slate-300',
  sent:                'bg-blue-900/60 border-blue-700 text-blue-300',
  confirmed:           'bg-emerald-900/60 border-emerald-700 text-emerald-300',
  in_transit:          'bg-amber-900/60 border-amber-700 text-amber-300',
  awaiting:            'bg-purple-900/60 border-purple-700 text-purple-300',
  received:            'bg-teal-900/60 border-teal-700 text-teal-300',
  received_unchecked:  'bg-yellow-900/60 border-yellow-700 text-yellow-300',
  entered_system:      'bg-indigo-900/60 border-indigo-700 text-indigo-300',
  fully_checked:       'bg-green-900/60 border-green-700 text-green-300',
  cancelled:           'bg-red-950/60 border-red-900 text-red-400',
};

const STATUS_ICON: Partial<Record<PurchaseOrderStatus, React.ReactNode>> = {
  draft:              <Clock className="w-3 h-3"/>,
  sent:               <Clock className="w-3 h-3"/>,
  confirmed:          <CheckCircle className="w-3 h-3"/>,
  in_transit:         <Truck className="w-3 h-3"/>,
  awaiting:           <Package className="w-3 h-3"/>,
  received:           <CheckCircle className="w-3 h-3"/>,
  received_unchecked: <AlertTriangle className="w-3 h-3"/>,
  fully_checked:      <CheckCircle className="w-3 h-3"/>,
  cancelled:          <XCircle className="w-3 h-3"/>,
};

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Rascunho', sent: 'Enviado', confirmed: 'Confirmado',
  in_transit: 'Em Trânsito', awaiting: 'Aguardando Retirada',
  received: 'Recebido', received_unchecked: 'Conferir', entered_system: 'No Sistema',
  fully_checked: 'Concluído', cancelled: 'Cancelado',
};

const ACTIVE_STATUSES: PurchaseOrderStatus[] = ['draft','sent','confirmed','in_transit','awaiting','received','received_unchecked','entered_system'];

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtCurrency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function weekKey(d: Date) {
  const mon = startOfWeek(d);
  return mon.toISOString().split('T')[0];
}

// ── componente principal ────────────────────────────────────────────────────

const Schedule: React.FC<ScheduleProps> = ({ suppliers, purchaseOrders, setPurchaseOrders }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [baseWeek, setBaseWeek] = useState(() => startOfWeek(new Date()));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [weeksToShow] = useState(4);

  // Gerar semanas
  const weeks = useMemo(() => {
    return Array.from({ length: weeksToShow }, (_, i) => {
      const mon = addDays(baseWeek, i * 7);
      const sun = addDays(mon, 6);
      return { mon, sun, key: weekKey(mon) };
    });
  }, [baseWeek, weeksToShow]);

  // Classificar pedidos em cada semana
  const ordersByWeek = useMemo(() => {
    const map: Record<string, PurchaseOrder[]> = {};
    weeks.forEach(w => { map[w.key] = []; });

    purchaseOrders.forEach(order => {
      if (order.status === 'cancelled') return;

      const supplier = suppliers.find(s => s.id === order.supplierId);
      const isUncertain = supplier?.deliveryUncertain;

      // Data de referência para posicionamento
      const refDate = order.expectedDate ? new Date(order.expectedDate) : new Date(order.createdAt);
      refDate.setHours(0, 0, 0, 0);

      weeks.forEach(w => {
        if (isUncertain && supplier?.deliveryMinDays && supplier?.deliveryMaxDays) {
          // Calcular janela de entrega incerta
          const minDate = addDays(new Date(order.createdAt), supplier.deliveryMinDays);
          const maxDate = addDays(new Date(order.createdAt), supplier.deliveryMaxDays);
          minDate.setHours(0, 0, 0, 0);
          maxDate.setHours(0, 0, 0, 0);
          // Aparecer na semana se a janela toca a semana
          if (minDate <= w.sun && maxDate >= w.mon) {
            map[w.key].push(order);
          }
        } else {
          // Pedido normal — aparece na semana da data de referência
          if (refDate >= w.mon && refDate <= w.sun) {
            map[w.key].push(order);
          }
        }
      });
    });

    return map;
  }, [purchaseOrders, suppliers, weeks]);

  // Pedidos sem data definida (aparecem no topo)
  const undatedOrders = useMemo(() =>
    purchaseOrders.filter(o =>
      ACTIVE_STATUSES.includes(o.status) &&
      !o.expectedDate &&
      !suppliers.find(s => s.id === o.supplierId)?.deliveryUncertain
    ),
  [purchaseOrders, suppliers]);

  const toggleWeek = (key: string) => {
    setCollapsed(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const renderOrderBadge = (order: PurchaseOrder) => {
    const supplier = suppliers.find(s => s.id === order.supplierId);
    const isUncertain = supplier?.deliveryUncertain;
    const minDays = supplier?.deliveryMinDays;
    const maxDays = supplier?.deliveryMaxDays;

    return (
      <div key={order.id}
        className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${STATUS_COLOR[order.status]}`}>
        <div className="shrink-0">{STATUS_ICON[order.status] ?? <Clock className="w-3 h-3"/>}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{order.supplierName}</div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5 opacity-80">
            <span>{STATUS_LABEL[order.status]}</span>
            <span>·</span>
            <span>{fmtCurrency(order.totalValue)}</span>
            <span>·</span>
            <span>{order.deliveryOrPickup === 'pickup' ? '🏪' : '🚚'}</span>
            {isUncertain && minDays && maxDays ? (
              <span className="text-amber-300/80 flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5"/>
                entre {fmtDate(addDays(new Date(order.createdAt), minDays))} e {fmtDate(addDays(new Date(order.createdAt), maxDays))}
              </span>
            ) : order.expectedDate ? (
              <span>{new Date(order.expectedDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}{order.expectedTime ? ` às ${order.expectedTime}` : ''}</span>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 text-[10px] opacity-60">{order.items.length} itens</span>
      </div>
    );
  };

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-amber-400"/>
          <h2 className="text-white font-bold text-lg">Cronograma de Entregas</h2>
        </div>
        {/* Navegação de semanas */}
        <div className="flex items-center gap-2">
          <button onClick={() => setBaseWeek(prev => addDays(prev, -7))}
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4"/>
          </button>
          <button onClick={() => setBaseWeek(startOfWeek(new Date()))}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:text-white transition-colors">
            Hoje
          </button>
          <button onClick={() => setBaseWeek(prev => addDays(prev, 7))}
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors">
            <ChevronRight className="w-4 h-4"/>
          </button>
        </div>
      </div>

      {/* Pedidos sem data — bloco flutuante */}
      {undatedOrders.length > 0 && (
        <div className="border border-slate-700/50 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleWeek('undated')}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/40 hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-500"/>
              <span className="text-sm font-semibold text-slate-400">Sem data definida</span>
              <span className="text-xs text-slate-600">({undatedOrders.length})</span>
            </div>
            {collapsed.has('undated') ? <ChevronDown className="w-4 h-4 text-slate-500"/> : <ChevronUp className="w-4 h-4 text-slate-500"/>}
          </button>
          {!collapsed.has('undated') && (
            <div className="p-3 space-y-2">
              {undatedOrders.map(renderOrderBadge)}
            </div>
          )}
        </div>
      )}

      {/* Grade de semanas */}
      {weeks.map(({ mon, sun, key }) => {
        const orders = ordersByWeek[key] || [];
        const isCurrentWeek = weekKey(today) === key;
        const isCollapsed = collapsed.has(key);

        // Dias da semana para a grade visual
        const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));

        return (
          <div key={key} className={`border rounded-xl overflow-hidden ${isCurrentWeek ? 'border-amber-700/40' : 'border-slate-800'}`}>
            {/* Header da semana */}
            <button
              onClick={() => toggleWeek(key)}
              className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${isCurrentWeek ? 'bg-amber-950/20 hover:bg-amber-950/30' : 'bg-slate-800/40 hover:bg-slate-800/60'}`}
            >
              <div className="flex items-center gap-2">
                <CalendarDays className={`w-3.5 h-3.5 ${isCurrentWeek ? 'text-amber-400' : 'text-slate-500'}`}/>
                <span className={`text-sm font-semibold ${isCurrentWeek ? 'text-amber-300' : 'text-slate-300'}`}>
                  {isCurrentWeek && '★ '}
                  {fmtDate(mon)} – {fmtDate(sun)}
                </span>
                {orders.length > 0 && (
                  <span className="text-xs text-slate-500">
                    ({orders.length} pedido{orders.length > 1 ? 's' : ''} · {fmtCurrency(orders.reduce((s,o) => s + o.totalValue, 0))})
                  </span>
                )}
              </div>
              {isCollapsed ? <ChevronDown className="w-4 h-4 text-slate-500"/> : <ChevronUp className="w-4 h-4 text-slate-500"/>}
            </button>

            {!isCollapsed && (
              <div className="p-3 space-y-3">
                {/* Mini-calendário de dias */}
                <div className="grid grid-cols-7 gap-1">
                  {days.map((day, i) => {
                    const isToday = day.toDateString() === today.toDateString();
                    const dayOrders = purchaseOrders.filter(o => {
                      if (o.status === 'cancelled') return false;
                      const exp = o.expectedDate ? new Date(o.expectedDate) : null;
                      if (!exp) return false;
                      exp.setHours(0,0,0,0);
                      return exp.toDateString() === day.toDateString();
                    });
                    return (
                      <div key={i} className={`rounded-lg p-1.5 text-center ${isToday ? 'bg-amber-900/30 border border-amber-700/40' : 'bg-slate-900/50'}`}>
                        <div className="text-[10px] text-slate-600">{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][i]}</div>
                        <div className={`text-sm font-bold ${isToday ? 'text-amber-300' : 'text-slate-400'}`}>{day.getDate()}</div>
                        {dayOrders.length > 0 && (
                          <div className="mt-1 flex justify-center">
                            <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center">{dayOrders.length}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Lista de pedidos desta semana */}
                {orders.length === 0 ? (
                  <p className="text-center text-xs text-slate-700 py-2">Nenhum pedido previsto para esta semana.</p>
                ) : (
                  <div className="space-y-2">
                    {orders.map(renderOrderBadge)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Legenda */}
      <div className="border border-slate-800/50 rounded-xl p-4 bg-slate-900/30">
        <p className="text-[10px] text-slate-600 font-bold uppercase mb-3">Legenda de status</p>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(STATUS_LABEL) as [PurchaseOrderStatus, string][])
            .filter(([k]) => k !== 'cancelled')
            .map(([status, label]) => (
              <span key={status} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${STATUS_COLOR[status]}`}>
                {STATUS_ICON[status]} {label}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
};

export default Schedule;
