import React, { useState } from 'react';
import { Supplier, BusinessHours } from '../../types';
import { Settings, X, Save, RefreshCw, Phone, MapPin, Truck, Calendar, Clock } from 'lucide-react';

const DEFAULT_ORDER_TEMPLATE = `Olá, tudo bem? Segue pedido [DATA] às [HORA]:

[ITENS]

Total: [TOTAL]
Tipo: [TIPO]
Previsão: [PREVISAO]`;

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  sun: { open: false, hours: '' },
  mon: { open: true,  hours: '08:00-18:00' },
  tue: { open: true,  hours: '08:00-18:00' },
  wed: { open: true,  hours: '08:00-18:00' },
  thu: { open: true,  hours: '08:00-18:00' },
  fri: { open: true,  hours: '08:00-18:00' },
  sat: { open: false, hours: '' },
};

const DAY_LABELS: { key: keyof BusinessHours; short: string }[] = [
  { key: 'sun', short: 'Dom' },
  { key: 'mon', short: 'Seg' },
  { key: 'tue', short: 'Ter' },
  { key: 'wed', short: 'Qua' },
  { key: 'thu', short: 'Qui' },
  { key: 'fri', short: 'Sex' },
  { key: 'sat', short: 'Sáb' },
];

interface SupplierEditModalProps {
  supplier: Supplier;
  onSave: (updated: Supplier) => void;
  onClose: () => void;
}

const SupplierEditModal: React.FC<SupplierEditModalProps> = ({ supplier, onSave, onClose }) => {
  const [editing, setEditing] = useState<Supplier>({ ...supplier });
  const [editingHoursDay, setEditingHoursDay] = useState<keyof BusinessHours | null>(null);

  const update = (patch: Partial<Supplier>) => setEditing(p => ({ ...p, ...patch }));

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 w-full max-w-xl rounded-2xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950 rounded-t-2xl">
          <h3 className="font-bold text-white flex items-center gap-2"><Settings className="w-4 h-4 text-amber-400" /> Editar Fornecedor</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-500 hover:text-white" /></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-5">

          {/* Básico */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Informações Básicas</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome</label>
                <input
                  value={editing.name}
                  onChange={e => update({ name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><Phone className="w-3 h-3" /> WhatsApp</label>
                <input
                  placeholder="44999998888"
                  value={editing.whatsapp || ''}
                  onChange={e => update({ whatsapp: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Endereço (para Maps)</label>
              <input
                placeholder="Rua das Flores, 123, Centro, Maringá-PR"
                value={editing.address || ''}
                onChange={e => update({ address: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Logística */}
          <div className="space-y-3 border-t border-slate-800 pt-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Logística</p>
            <div>
              <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><Truck className="w-3 h-3" /> Tipo de atendimento</label>
              <div className="flex gap-2">
                {(['pickup', 'delivery', 'both'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => update({ deliveryType: t })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border ${editing.deliveryType === t ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                  >
                    {t === 'pickup' ? '🏪 Retirada' : t === 'delivery' ? '🚚 Entrega' : '↕️ Ambos'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Frequência de pedido</label>
                <select
                  value={editing.orderFrequency || ''}
                  onChange={e => update({ orderFrequency: e.target.value as any })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                >
                  <option value="">Livre</option>
                  <option value="daily">Diário</option>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quinzenal</option>
                  <option value="monthly">Mensal</option>
                  <option value="custom">A cada X dias</option>
                </select>
              </div>
              {editing.orderFrequency === 'custom' && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">A cada quantos dias?</label>
                  <input
                    type="number" min={1}
                    value={editing.orderFrequencyDays || ''}
                    onChange={e => update({ orderFrequencyDays: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}
              {(['weekly', 'biweekly'] as const).includes(editing.orderFrequency as any) && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Dia da semana</label>
                  <select
                    value={editing.orderWeekDay ?? ''}
                    onChange={e => update({ orderWeekDay: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  >
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Dias de pedido (descrição)</label>
                <input
                  placeholder="toda quarta-feira"
                  value={editing.orderDays || ''}
                  onChange={e => update({ orderDays: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Dias de entrega (descrição)</label>
                <input
                  placeholder="toda quinta-feira / dia seguinte"
                  value={editing.deliveryDays || ''}
                  onChange={e => update({ deliveryDays: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Entrega incerta */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => update({ deliveryUncertain: !editing.deliveryUncertain })}
                className={`relative w-10 h-5 rounded-full transition-all ${editing.deliveryUncertain ? 'bg-amber-600' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${editing.deliveryUncertain ? 'left-5' : 'left-0.5'}`} />
              </button>
              <span className="text-xs text-slate-300">Entrega sem data garantida</span>
            </div>
            {editing.deliveryUncertain && (
              <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-amber-800/40">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Mínimo (dias)</label>
                  <input
                    type="number" min={1}
                    value={editing.deliveryMinDays || ''}
                    onChange={e => update({ deliveryMinDays: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Máximo (dias)</label>
                  <input
                    type="number" min={1}
                    value={editing.deliveryMaxDays || ''}
                    onChange={e => update({ deliveryMaxDays: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            {/* Tempos */}
            {(editing.deliveryType === 'pickup' || editing.deliveryType === 'both') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Tempo de preparo (min)</label>
                  <input
                    type="number" min={0} placeholder="ex: 240"
                    value={editing.pickupReadyMinutes || ''}
                    onChange={e => update({ pickupReadyMinutes: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Permanência média (min)</label>
                  <input
                    type="number" min={0} placeholder="ex: 30"
                    value={editing.pickupStayMinutes || ''}
                    onChange={e => update({ pickupStayMinutes: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}
            {(editing.deliveryType === 'delivery' || editing.deliveryType === 'both') && (
              <div>
                <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Horário esperado de entrega</label>
                <input
                  type="time"
                  value={editing.expectedDeliveryTime || ''}
                  onChange={e => update({ expectedDeliveryTime: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            )}
          </div>

          {/* Horários de Funcionamento */}
          <div className="space-y-2 border-t border-slate-800 pt-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Horário de Funcionamento</p>
            <div className="flex gap-1">
              {DAY_LABELS.map(({ key, short }) => {
                const day = (editing.openingHours ?? DEFAULT_BUSINESS_HOURS)[key];
                const isEditing = editingHoursDay === key;
                return (
                  <div key={key} className="flex-1 flex flex-col items-center gap-0.5">
                    <button
                      onClick={() => {
                        const cur = editing.openingHours ?? { ...DEFAULT_BUSINESS_HOURS };
                        update({ openingHours: { ...cur, [key]: { ...cur[key], open: !cur[key].open } } });
                      }}
                      className={`w-full text-[10px] font-bold rounded py-1 transition-all border ${day.open ? 'bg-amber-600/20 border-amber-600/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-600'}`}
                    >
                      {short}
                    </button>
                    {day.open ? (
                      isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          value={day.hours}
                          placeholder="08:00-18:00"
                          onChange={e => {
                            const cur = editing.openingHours ?? { ...DEFAULT_BUSINESS_HOURS };
                            update({ openingHours: { ...cur, [key]: { ...cur[key], hours: e.target.value } } });
                          }}
                          onBlur={() => setEditingHoursDay(null)}
                          onKeyDown={e => e.key === 'Enter' && setEditingHoursDay(null)}
                          className="w-full text-[9px] bg-slate-800 border border-amber-600/50 rounded px-0.5 py-0.5 text-center text-amber-300 focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingHoursDay(key)}
                          className="w-full text-[9px] text-slate-400 hover:text-amber-300 text-center leading-tight px-0.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
                          title="Clique para editar horários"
                        >
                          {day.hours || <span className="text-slate-600 italic">add</span>}
                        </button>
                      )
                    ) : (
                      <span className="text-[9px] text-slate-700 text-center">fechado</span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-600">Clique no dia para abrir/fechar · Clique no horário para editar · Ex: <span className="text-slate-500">08:00-12:00, 14:00-18:00</span></p>
          </div>

          {/* Template */}
          <div className="space-y-2 border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Template de Pedido</p>
              <button
                onClick={() => update({ orderTemplate: DEFAULT_ORDER_TEMPLATE })}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-amber-400 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-800"
                title="Resetar para o template padrão"
              >
                <RefreshCw className="w-2.5 h-2.5" /> Padrão
              </button>
            </div>
            <p className="text-[11px] text-slate-600">Variáveis: <span className="text-slate-400">[DATA] [HORA] [ITENS] [TOTAL] [TIPO] [PREVISAO]</span></p>
            <textarea
              rows={5}
              value={editing.orderTemplate ?? DEFAULT_ORDER_TEMPLATE}
              onChange={e => update({ orderTemplate: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 resize-none font-mono text-xs leading-relaxed"
            />
          </div>
        </div>
        <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition-colors">Cancelar</button>
          <button onClick={() => onSave(editing)} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors flex items-center gap-2">
            <Save className="w-4 h-4" /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupplierEditModal;
