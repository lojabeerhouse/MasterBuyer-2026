import React, { useState, useRef, useEffect } from 'react';
import { Supplier, QuoteBatch, CartItem } from '../types';
import { FileText, FileCode, Image as ImageIcon, File, Trash2, Send, Loader2, AlertCircle, CheckCircle, Search, ChevronDown, ShoppingCart, X, Plus } from 'lucide-react';

export type FileTag = 'quote' | 'order' | 'invoice';

export interface UploadedFileData {
  id: string;
  file: File;
  supplierId?: string;
  mappedDate?: number;
  tags: FileTag[];
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
  isSelected: boolean;
}

interface UploadItemProps {
  item: UploadedFileData;
  suppliers: Supplier[];
  onUpdate: (id: string, partial: Partial<UploadedFileData>) => void;
  onRemove: (id: string) => void;
  onProcess: (id: string) => void;
  processedBatch?: { batch: QuoteBatch; supplierId: string };
  onCreateOrder?: (items: CartItem[], supplierId: string) => void;
}

const UploadItem: React.FC<UploadItemProps> = ({ item, suppliers, onUpdate, onRemove, onProcess, processedBatch, onCreateOrder }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderQtys, setOrderQtys] = useState<Record<string, number>>({});

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getFileIcon = () => {
    const t = item.file.type;
    const n = item.file.name.toLowerCase();
    if (t.includes('pdf') || n.endsWith('.pdf')) return <FileText className="w-8 h-8 text-red-400" />;
    if (t.includes('xml') || n.endsWith('.xml')) return <FileCode className="w-8 h-8 text-blue-400" />;
    if (t.includes('image') || n.match(/\.(jpeg|jpg|png|webp)$/)) return <ImageIcon className="w-8 h-8 text-emerald-400" />;
    return <File className="w-8 h-8 text-slate-400" />;
  };

  const getStatusIcon = () => {
    switch (item.status) {
      case 'processing': return <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />;
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />;
      default: return null;
    }
  };

  const toggleTag = (tag: FileTag) => {
    const newTags = item.tags.includes(tag)
      ? item.tags.filter(t => t !== tag)
      : [...item.tags, tag];
    onUpdate(item.id, { tags: newTags });
  };

  const selectedSupplier = suppliers.find(s => s.id === item.supplierId);
  const filteredSuppliers = suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()));

  // Converte o mappedDate pra string pro input date
  const dateStr = item.mappedDate 
    ? new Date(item.mappedDate).toISOString().split('T')[0] 
    : '';

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
      onUpdate(item.id, { mappedDate: undefined });
    } else {
       // Pega meia noite na data local
       const d = new Date(val + 'T00:00:00');
       onUpdate(item.id, { mappedDate: d.getTime() });
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const openOrderModal = () => {
    if (!processedBatch) return;
    const initial: Record<string, number> = {};
    processedBatch.batch.items.forEach(i => { initial[i.sku] = 1; });
    setOrderQtys(initial);
    setShowOrderModal(true);
  };

  const confirmOrder = () => {
    if (!processedBatch || !onCreateOrder) return;
    const supplier = suppliers.find(s => s.id === processedBatch.supplierId);
    const cartItems: CartItem[] = processedBatch.batch.items
      .filter(i => (orderQtys[i.sku] || 0) > 0)
      .map(i => ({
        id: `${processedBatch.supplierId}-${i.sku}`,
        sku: i.sku,
        productName: i.name,
        supplierId: processedBatch.supplierId,
        supplierName: supplier?.name || processedBatch.supplierId,
        packQuantity: i.packQuantity,
        packPrice: i.price,
        quantityToBuy: orderQtys[i.sku] || 1,
        totalCost: i.price * (orderQtys[i.sku] || 1),
      }));
    if (cartItems.length === 0) return;
    onCreateOrder(cartItems, processedBatch.supplierId);
    setShowOrderModal(false);
  };

  return (
    <>
    <div className={`flex flex-col md:flex-row md:items-center gap-4 p-4 rounded-xl border transition-all ${
      item.isSelected ? 'bg-slate-800/80 border-amber-500/50 shadow-lg shadow-amber-900/20' : 'bg-slate-900 border-slate-700 hover:border-slate-500'
    }`}>
      
      {/* Checkbox e Ícone */}
      <div className="flex items-center gap-4 shrink-0">
        <input 
          type="checkbox" 
          checked={item.isSelected} 
          onChange={(e) => onUpdate(item.id, { isSelected: e.target.checked })}
          className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900 cursor-pointer"
        />
        <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
          {getFileIcon()}
        </div>
      </div>

      {/* Nome e Tamanho */}
      <div className="flex-1 min-w-0">
        <h4 className="text-white font-medium truncate" title={item.file.name}>{item.file.name}</h4>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-400">{formatSize(item.file.size)}</span>
          {getStatusIcon()}
          {item.status === 'error' && item.errorMessage && (
             <span className="text-xs text-red-400 truncate max-w-[200px]" title={item.errorMessage}>{item.errorMessage}</span>
          )}
        </div>
      </div>

      {/* Controles: Fornecedor, Data, Tags */}
      <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
        
        {/* Combobox Fornecedor */}
        <div className="relative w-full md:w-56" ref={dropdownRef}>
          <button 
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`w-full flex items-center justify-between px-3 py-2 bg-slate-950 border rounded-lg text-sm transition-colors ${
              !item.supplierId ? 'border-amber-500/50 text-amber-200 bg-amber-950/20' : 'border-slate-700 text-white hover:border-slate-500'
            }`}
          >
            <span className="truncate">{selectedSupplier ? selectedSupplier.name : 'Selecionar Fornecedor...'}</span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
          
          {isDropdownOpen && (
            <div className="absolute top-full left-0 z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
              <div className="p-2 border-b border-slate-700 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Buscar..." 
                  value={supplierSearch}
                  onChange={e => setSupplierSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredSuppliers.length === 0 ? (
                  <div className="p-3 text-sm text-slate-400 text-center">Nenhum encontrado</div>
                ) : (
                  filteredSuppliers.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onUpdate(item.id, { supplierId: s.id });
                        setIsDropdownOpen(false);
                        setSupplierSearch('');
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-amber-600 hover:text-white transition-colors"
                    >
                      {s.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Data */}
        <div className="relative">
          <input 
            type="date" 
            value={dateStr}
            onChange={handleDateChange}
            className="w-36 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
          />
        </div>

        {/* Tags */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
          <button
            onClick={() => toggleTag('quote')}
            className={`px-2.5 py-1.5 rounded text-xs font-bold transition-colors ${
              item.tags.includes('quote') ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Cotação"
          >
            COT
          </button>
          <button
            onClick={() => toggleTag('order')}
            className={`px-2.5 py-1.5 rounded text-xs font-bold transition-colors ${
              item.tags.includes('order') ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Pedido de Compra"
          >
            PED
          </button>
          <button
            onClick={() => toggleTag('invoice')}
            className={`px-2.5 py-1.5 rounded text-xs font-bold transition-colors ${
              item.tags.includes('invoice') ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Nota Fiscal (NF-e)"
          >
            NF
          </button>
        </div>

        {/* Botão de Processar Individual */}
        <div className="pl-2 border-l border-slate-700 ml-1 flex gap-2">
            <button
                onClick={() => onRemove(item.id)}
                className="p-2 bg-slate-800 hover:bg-red-950/50 text-slate-400 hover:text-red-400 rounded-lg transition-colors border border-slate-700 hover:border-red-900"
                title="Remover"
            >
                <Trash2 className="w-4 h-4" />
            </button>
            <button
                onClick={() => onProcess(item.id)}
                disabled={item.status === 'processing' || !item.supplierId || item.tags.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors shadow-lg shadow-amber-900/20"
                title={!item.supplierId ? 'Selecione um fornecedor' : item.tags.length === 0 ? 'Selecione pelo menos uma tag' : 'Processar arquivo'}
            >
                {item.status === 'processing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="hidden sm:inline">Enviar</span>
            </button>
            {processedBatch && onCreateOrder && (
              <button
                onClick={openOrderModal}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg transition-colors"
                title="Montar pedido de compra a partir deste arquivo"
              >
                <ShoppingCart className="w-4 h-4" />
                <span className="hidden sm:inline">Montar Pedido</span>
              </button>
            )}
        </div>

      </div>
    </div>

    {/* ── Mini-modal: Montar Pedido ── */}
    {showOrderModal && processedBatch && (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-400"/>
              Montar Pedido — {suppliers.find(s => s.id === processedBatch.supplierId)?.name || processedBatch.supplierId}
            </h3>
            <button onClick={() => setShowOrderModal(false)}><X className="w-5 h-5 text-slate-500 hover:text-white"/></button>
          </div>

          <div className="p-4 overflow-y-auto flex-1 space-y-1">
            <p className="text-xs text-slate-500 mb-3">{processedBatch.batch.items.length} produto(s) encontrado(s). Ajuste as quantidades (em caixas) e confirme.</p>
            {processedBatch.batch.items.map(prod => {
              const qty = orderQtys[prod.sku] ?? 1;
              return (
                <div key={prod.sku} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition-colors ${qty > 0 ? 'bg-slate-800/80' : 'bg-slate-900 opacity-50'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 text-xs truncate">{prod.name}</p>
                    <p className="text-slate-500 text-[10px]">Cx {prod.packQuantity} · R$ {prod.price.toFixed(2).replace('.', ',')}/cx</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setOrderQtys(prev => ({ ...prev, [prod.sku]: Math.max(0, (prev[prod.sku] ?? 1) - 1) }))}
                      className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center text-sm">−</button>
                    <span className="w-7 text-center text-white text-xs font-semibold">{qty}</span>
                    <button
                      onClick={() => setOrderQtys(prev => ({ ...prev, [prod.sku]: (prev[prod.sku] ?? 1) + 1 }))}
                      className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center text-sm">+</button>
                  </div>
                  <span className="text-xs text-amber-400 w-20 text-right shrink-0">
                    R$ {(prod.price * qty).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              Total: <strong className="text-white">R$ {
                processedBatch.batch.items
                  .reduce((s, p) => s + p.price * (orderQtys[p.sku] ?? 1), 0)
                  .toFixed(2).replace('.', ',')
              }</strong>
            </span>
            <div className="flex gap-2">
              <button onClick={() => setShowOrderModal(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white">Cancelar</button>
              <button
                onClick={confirmOrder}
                disabled={Object.values(orderQtys).every(q => q === 0)}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4"/> Criar Pedido
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default UploadItem;
