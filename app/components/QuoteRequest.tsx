import React, { useState, useMemo } from 'react';
import { Supplier, SupplierCatalog, SupplierCatalogProduct } from '../types';
import { getValidPrice } from '../services/supplierCatalogService';
import {
  Search, MessageSquare, Phone, Copy, Check, ChevronDown, ChevronUp,
  Clock, X, SendHorizonal, Zap, Square, CheckSquare, AlertCircle,
  RefreshCw, Package, Filter,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnrichedProduct extends SupplierCatalogProduct {
  isExpired: boolean;
  displayPrice: { unitPrice: number; packPrice: number; packQuantity: number; date: number } | null;
}

interface SupplierSection {
  supplierId: string;
  supplierName: string;
  supplier: Supplier | undefined;
  products: EnrichedProduct[];
  expiredCount: number;
}

interface QuoteRequestProps {
  suppliers: Supplier[];
  catalogs: Record<string, SupplierCatalog>;
  globalValidityDays: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) => `R$${v.toFixed(2).replace('.', ',')}`;
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const searchNorm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ─── Component ────────────────────────────────────────────────────────────────

const QuoteRequest: React.FC<QuoteRequestProps> = ({ suppliers, catalogs, globalValidityDays }) => {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set()); // `${supplierId}:${productId}`
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyExpired, setShowOnlyExpired] = useState(false);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ─── Enrich products with validity info ────────────────────────────────────

  const sections = useMemo<SupplierSection[]>(() => {
    return Object.entries(catalogs)
      .map(([supplierId, catalog]) => {
        const supplier = suppliers.find(s => s.id === supplierId);
        const effectiveDays = catalog.priceValidityDays ?? globalValidityDays;

        const products: EnrichedProduct[] = catalog.products.map(p => {
          const validPrice = getValidPrice(p, catalog.priceValidityMode, effectiveDays);
          const raw = p.priceHistory[0] ?? null;
          const displayPrice = validPrice ?? (raw ? {
            unitPrice: raw.unitPrice, packPrice: raw.packPrice,
            packQuantity: raw.packQuantity, date: raw.date,
          } : null);
          const isExpired = !validPrice && displayPrice !== null;
          return { ...p, isExpired, displayPrice };
        });

        return {
          supplierId,
          supplierName: catalog.supplierName,
          supplier,
          products,
          expiredCount: products.filter(p => p.isExpired).length,
        };
      })
      .filter(s => s.products.length > 0)
      .sort((a, b) => b.expiredCount - a.expiredCount);
  }, [catalogs, suppliers, globalValidityDays]);

  const totalExpired = useMemo(
    () => sections.reduce((acc, s) => acc + s.expiredCount, 0),
    [sections]
  );

  // ─── Filter helpers ────────────────────────────────────────────────────────

  const getVisible = (section: SupplierSection): EnrichedProduct[] => {
    let list = section.products;
    if (showOnlyExpired) list = list.filter(p => p.isExpired);
    if (searchTerm.trim()) {
      const term = searchNorm(searchTerm);
      list = list.filter(p =>
        searchNorm(p.name).includes(term) ||
        searchNorm(p.supplierSku ?? '').includes(term)
      );
    }
    return list;
  };

  // ─── Selection helpers ─────────────────────────────────────────────────────

  const toggle = (supplierId: string, productId: string) => {
    const key = `${supplierId}:${productId}`;
    setSelectedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSupplier = (section: SupplierSection) => {
    const visible = getVisible(section);
    const allSel = visible.length > 0 && visible.every(p => selectedKeys.has(`${section.supplierId}:${p.id}`));
    setSelectedKeys(prev => {
      const next = new Set(prev);
      visible.forEach(p => {
        const k = `${section.supplierId}:${p.id}`;
        allSel ? next.delete(k) : next.add(k);
      });
      return next;
    });
  };

  const selectAllExpired = () => {
    const next = new Set<string>();
    sections.forEach(s => s.products.filter(p => p.isExpired).forEach(p => next.add(`${s.supplierId}:${p.id}`)));
    setSelectedKeys(next);
    // Expand all suppliers that have expired products
    setExpandedSuppliers(new Set(sections.filter(s => s.expiredCount > 0).map(s => s.supplierId)));
  };

  const clearAll = () => setSelectedKeys(new Set());

  // ─── Selected grouped by supplier ─────────────────────────────────────────

  const selectedBySupplier = useMemo(() => {
    const result: Record<string, { supplierName: string; supplier: Supplier | undefined; products: EnrichedProduct[] }> = {};
    sections.forEach(s => {
      const prods = s.products.filter(p => selectedKeys.has(`${s.supplierId}:${p.id}`));
      if (prods.length > 0) result[s.supplierId] = { supplierName: s.supplierName, supplier: s.supplier, products: prods };
    });
    return result;
  }, [selectedKeys, sections]);

  const selectedCount = selectedKeys.size;
  const selectedSupplierCount = Object.keys(selectedBySupplier).length;

  // ─── Message generation ────────────────────────────────────────────────────

  const generateMessage = (supplierName: string, products: EnrichedProduct[]): string => {
    const lines = products.map(p => {
      const priceInfo = p.displayPrice
        ? ` (últ.: ${fmt(p.displayPrice.unitPrice)}/un · ${fmtDate(p.displayPrice.date)})`
        : '';
      return `• ${p.name}${priceInfo}`;
    });
    return `Olá ${supplierName}, tudo bem?\nPreciso de cotação dos itens abaixo:\n\n${lines.join('\n')}\n\nAguardo retorno. Obrigado!`;
  };

  const copyMsg = (supplierId: string, msg: string) => {
    navigator.clipboard.writeText(msg);
    setCopiedId(supplierId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openWhatsApp = (whatsapp: string, msg: string) => {
    const phone = whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const openModal = () => {
    setActiveTab(Object.keys(selectedBySupplier)[0] ?? null);
    setShowModal(true);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shrink-0">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-500" /> Abrir Cotação
            </h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Selecione os produtos e gere mensagens de cotação prontas para cada fornecedor
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            {selectedCount > 0 && (
              <button onClick={clearAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-colors">
                <X className="w-3.5 h-3.5" /> Limpar seleção
              </button>
            )}
            {totalExpired > 0 && (
              <button
                onClick={selectAllExpired}
                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-amber-900/30"
              >
                <Zap className="w-4 h-4" />
                Selecionar {totalExpired} expirado{totalExpired > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar produto por nome ou SKU..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:border-amber-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowOnlyExpired(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border whitespace-nowrap ${showOnlyExpired ? 'bg-amber-600/20 border-amber-500 text-amber-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
          >
            <Clock className="w-3.5 h-3.5" /> Só expirados
          </button>
        </div>
      </div>

      {/* ── Supplier list ── */}
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
        {sections.map(section => {
          const visible = getVisible(section);
          if (visible.length === 0) return null;

          const isExpanded = expandedSuppliers.has(section.supplierId);
          const selectedInSection = visible.filter(p => selectedKeys.has(`${section.supplierId}:${p.id}`)).length;
          const allSelected = visible.length > 0 && selectedInSection === visible.length;
          const someSelected = selectedInSection > 0 && !allSelected;

          return (
            <div key={section.supplierId} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              {/* Supplier header row */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-700/40 transition-colors select-none"
                onClick={() => setExpandedSuppliers(prev => {
                  const next = new Set(prev);
                  next.has(section.supplierId) ? next.delete(section.supplierId) : next.add(section.supplierId);
                  return next;
                })}
              >
                {/* Checkbox for whole supplier */}
                <button
                  onClick={e => { e.stopPropagation(); toggleSupplier(section); }}
                  className="shrink-0 transition-colors hover:text-amber-400"
                >
                  {allSelected
                    ? <CheckSquare className="w-4 h-4 text-amber-500" />
                    : someSelected
                      ? <CheckSquare className="w-4 h-4 text-amber-500/50" />
                      : <Square className="w-4 h-4 text-slate-500" />}
                </button>

                <span className="font-bold text-slate-200 flex-1 truncate">{section.supplierName}</span>

                <div className="flex items-center gap-2 shrink-0">
                  {section.expiredCount > 0 && (
                    <span className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-700/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {section.expiredCount} expirado{section.expiredCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {selectedInSection > 0 && (
                    <span className="text-[10px] bg-emerald-900/20 text-emerald-400 border border-emerald-700/20 px-2 py-0.5 rounded-full">
                      {selectedInSection} sel.
                    </span>
                  )}
                  <span className="text-slate-500 text-xs">{visible.length} produtos</span>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-slate-500" />
                    : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
              </div>

              {/* Product rows */}
              {isExpanded && (
                <div className="border-t border-slate-700 divide-y divide-slate-700/40">
                  {visible.map(p => {
                    const key = `${section.supplierId}:${p.id}`;
                    const isSel = selectedKeys.has(key);
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggle(section.supplierId, p.id)}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isSel ? 'bg-amber-950/25' : 'hover:bg-slate-700/25'}`}
                      >
                        <div className="shrink-0">
                          {isSel
                            ? <CheckSquare className="w-4 h-4 text-amber-500" />
                            : <Square className="w-4 h-4 text-slate-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 font-medium truncate">{p.name}</p>
                          {p.displayPrice ? (
                            <p className="text-[11px] text-slate-500">
                              {fmt(p.displayPrice.unitPrice)}/un · cx c/{p.displayPrice.packQuantity} · {fmtDate(p.displayPrice.date)}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-600">Sem histórico de preços</p>
                          )}
                        </div>
                        {p.isExpired && (
                          <span className="text-[10px] text-amber-500/80 flex items-center gap-0.5 shrink-0 ml-auto">
                            <Clock className="w-3 h-3" /> nova cotação
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {sections.every(s => getVisible(s).length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Package className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">Nenhum produto encontrado.</p>
            {Object.keys(catalogs).length === 0 && (
              <p className="text-xs mt-1 text-slate-600">Importe cotações dos seus fornecedores para começar.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky action bar ── */}
      {selectedCount > 0 && (
        <div className="shrink-0">
          <button
            onClick={openModal}
            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-amber-900/30 text-sm active:scale-[0.99]"
          >
            <SendHorizonal className="w-5 h-5" />
            Gerar cotações — {selectedCount} produto{selectedCount > 1 ? 's' : ''} de {selectedSupplierCount} fornecedor{selectedSupplierCount > 1 ? 'es' : ''}
          </button>
        </div>
      )}

      {/* ── Message modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="text-white font-bold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-500" />
                Pedidos de Cotação
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  {selectedCount} produto{selectedCount > 1 ? 's' : ''} · {selectedSupplierCount} fornecedor{selectedSupplierCount > 1 ? 'es' : ''}
                </span>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white p-1 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Supplier tabs */}
            <div className="flex gap-1.5 px-4 py-2.5 border-b border-slate-800 overflow-x-auto custom-scrollbar">
              {Object.entries(selectedBySupplier).map(([supplierId, data]) => (
                <button
                  key={supplierId}
                  onClick={() => setActiveTab(supplierId)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${
                    activeTab === supplierId
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  {data.supplierName}
                  <span className={`ml-1.5 text-[10px] ${activeTab === supplierId ? 'text-amber-200' : 'text-slate-500'}`}>
                    {data.products.length}
                  </span>
                </button>
              ))}
            </div>

            {/* Message area */}
            {activeTab && selectedBySupplier[activeTab] && (() => {
              const { supplierName, supplier, products } = selectedBySupplier[activeTab];
              const msg = generateMessage(supplierName, products);
              const isCopied = copiedId === activeTab;
              return (
                <div className="flex-1 overflow-auto p-4 space-y-3 min-h-0">
                  {/* Product summary chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {products.map(p => (
                      <span key={p.id} className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                        {p.isExpired && <Clock className="w-2.5 h-2.5 text-amber-500" />}
                        {p.name.length > 30 ? p.name.slice(0, 30) + '…' : p.name}
                      </span>
                    ))}
                  </div>

                  {/* Message preview */}
                  <pre className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                    {msg}
                  </pre>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => copyMsg(activeTab, msg)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                        isCopied
                          ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400'
                          : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {isCopied
                        ? <><Check className="w-4 h-4" /> Copiado!</>
                        : <><Copy className="w-4 h-4" /> Copiar mensagem</>}
                    </button>

                    {supplier?.whatsapp ? (
                      <button
                        onClick={() => openWhatsApp(supplier.whatsapp!, msg)}
                        className="flex-1 flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
                      >
                        <Phone className="w-4 h-4" /> Abrir no WhatsApp
                      </button>
                    ) : (
                      <div className="flex-1 flex items-center justify-center gap-2 bg-slate-800/50 border border-dashed border-slate-700 text-slate-600 py-2.5 rounded-xl text-xs">
                        <Phone className="w-3.5 h-3.5" /> WhatsApp não cadastrado
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteRequest;
