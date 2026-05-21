import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  PurchaseOrder, PurchaseOrderStatus, CartItem, Supplier, SupplierCatalog, UserProfile, PackRule
} from '../../types';
import {
  Plus, Trash2, ChevronDown, ChevronUp, ChevronRight,
  CheckCircle, XCircle, Truck, Package, ClipboardList,
  MessageCircle, Clock, Calendar, AlertTriangle, Check,
  Send, RotateCcw, Archive, Eye, Edit3, X, Save,
  ShoppingCart, MapPin, Phone, Search, UploadCloud, FileText, LayoutGrid
} from 'lucide-react';
import { useFileProcessor } from '../../hooks/useFileProcessor';
import EditOrderModal from '../EditOrderModal';
import ConfirmDialog from '../shared/ConfirmDialog';

interface OrderManagerProps {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  supplierCatalogs?: Record<string, SupplierCatalog>;
  userProfile?: UserProfile;
  globalPackRules?: PackRule[];
  getNextSeqNumber?: () => number;
}

// ── helpers ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  confirmed: 'Confirmado',
  in_transit: 'Em Trânsito',
  awaiting: 'Retirada',
  received: 'Recebido',
  received_unchecked: 'Conferir',
  entered_system: 'Lançado',
  fully_checked: 'Concluído ✓',
  cancelled: 'Cancelado',
};

const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  draft: 'text-slate-400 bg-slate-800 border-slate-700',
  sent: 'text-blue-400 bg-blue-950/40 border-blue-900/50',
  confirmed: 'text-emerald-400 bg-emerald-950/40 border-emerald-900/50',
  in_transit: 'text-amber-400 bg-amber-950/40 border-amber-900/50',
  awaiting: 'text-purple-400 bg-purple-950/40 border-purple-900/50',
  received: 'text-teal-400 bg-teal-950/40 border-teal-900/50',
  received_unchecked: 'text-yellow-400 bg-yellow-950/40 border-yellow-900/50',
  entered_system: 'text-indigo-400 bg-indigo-950/40 border-indigo-900/50',
  fully_checked: 'text-green-400 bg-green-950/40 border-green-900/50',
  cancelled: 'text-red-400 bg-red-950/40 border-red-900/50',
};

// Transições permitidas por status
const NEXT_ACTIONS: Record<PurchaseOrderStatus, { to: PurchaseOrderStatus; label: string; icon: React.ReactNode }[]> = {
  draft: [
    { to: 'sent', label: 'Enviar', icon: <Send className="w-3.5 h-3.5"/> },
  ],
  sent: [
    { to: 'confirmed', label: 'Confirmar', icon: <CheckCircle className="w-3.5 h-3.5"/> },
    { to: 'in_transit', label: 'Trânsito', icon: <Truck className="w-3.5 h-3.5"/> },
    { to: 'awaiting', label: 'Retirada', icon: <Package className="w-3.5 h-3.5"/> },
  ],
  confirmed: [
    { to: 'in_transit', label: 'Trânsito', icon: <Truck className="w-3.5 h-3.5"/> },
    { to: 'awaiting', label: 'Retirada', icon: <Package className="w-3.5 h-3.5"/> },
  ],
  in_transit: [
    { to: 'received', label: 'Conferido', icon: <CheckCircle className="w-3.5 h-3.5"/> },
    { to: 'received_unchecked', label: 'Entregue (Conferir)', icon: <Clock className="w-3.5 h-3.5"/> },
  ],
  awaiting: [
    { to: 'received', label: 'Conferido', icon: <CheckCircle className="w-3.5 h-3.5"/> },
    { to: 'received_unchecked', label: 'Retirado (Conferir)', icon: <Clock className="w-3.5 h-3.5"/> },
  ],
  received: [
    { to: 'entered_system', label: 'Lançar Sistema', icon: <Archive className="w-3.5 h-3.5"/> },
  ],
  received_unchecked: [
    { to: 'received', label: 'Conferido', icon: <Check className="w-3.5 h-3.5"/> },
    { to: 'entered_system', label: 'Lançar Sistema', icon: <Archive className="w-3.5 h-3.5"/> },
  ],
  entered_system: [
    { to: 'fully_checked', label: 'Concluir', icon: <CheckCircle className="w-3.5 h-3.5"/> },
  ],
  fully_checked: [],
  cancelled: [],
};

const OPEN_STATUSES: PurchaseOrderStatus[] = ['draft','sent','confirmed','in_transit','awaiting'];
const CHECK_STATUSES: PurchaseOrderStatus[] = ['received_unchecked'];
const DONE_STATUSES: PurchaseOrderStatus[] = ['received','entered_system','fully_checked'];

function fmtCurrency(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}`; }
function fmtDate(ts?: number) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtDatetime(ts?: number) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── componente principal ───────────────────────────────────────────────────

const OrderManager: React.FC<OrderManagerProps> = ({
  suppliers, purchaseOrders, setPurchaseOrders, cart, setCart,
  supplierCatalogs = {}, userProfile, globalPackRules = [], getNextSeqNumber,
}) => {

  // FILTROS & CHECKBOXES
  const [filterAll, setFilterAll] = useState(false);
  const [filterOpen, setFilterOpen] = useState(true);
  const [filterCheck, setFilterCheck] = useState(true);
  const [filterDone, setFilterDone] = useState(false);
  
  const [checkingOrder, setCheckingOrder] = useState<PurchaseOrder | null>(null);

  const [timeFilter, setTimeFilter] = useState<'30d' | 'current_month' | 'current_year' | 'all' | 'custom'>('30d');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');

  // Fluxo de Inteligência (NF <-> Pedido)
  const [linkInvoiceData, setLinkInvoiceData] = useState<{
    file: File;
    supplierId: string;
    items: CartItem[];
    detectedDate: number | null;
    pendingOrders: PurchaseOrder[];
  } | null>(null);

  // SELEÇÃO & BULK ACTIONS
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrder | null>(null);

  // MODAIS PADRÕES
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNote, setCancelNote] = useState('');
  
  // MODAL MANUAL
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSupplierId, setManualSupplierId] = useState('');
  const [manualSearch, setManualSearch] = useState('');
  const [manualQtys, setManualQtys] = useState<Record<string, number>>({});
  const [manualSupplierSearch, setManualSupplierSearch] = useState('');
  const [manualSupplierOpen, setManualSupplierOpen] = useState(false);
  const [manualNotes, setManualNotes] = useState('');
  const [manualInitialStatus, setManualInitialStatus] = useState<'draft' | 'received_unchecked'>('draft');
  const [manualPrices, setManualPrices] = useState<Record<string, { packPrice: number; unitPrice: number }>>({});
  const manualSupplierRef = useRef<HTMLDivElement>(null);

  // MODAL UPLOAD
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadSupplierId, setUploadSupplierId] = useState('');
  const [uploadSupplierSearch, setUploadSupplierSearch] = useState('');
  const [uploadSupplierOpen, setUploadSupplierOpen] = useState(false);
  const uploadSupplierRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { isProcessing, processFile } = useFileProcessor();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (manualSupplierRef.current && !manualSupplierRef.current.contains(e.target as Node)) {
        setManualSupplierOpen(false);
      }
      if (uploadSupplierRef.current && !uploadSupplierRef.current.contains(e.target as Node)) {
        setUploadSupplierOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── FILTERING LOGIC ──────────────────────────────────────────────────────

  const filteredOrders = useMemo(() => {
    let list = purchaseOrders.filter(o => o.status !== 'cancelled');

    // 1. Time Filter
    const now = new Date();
    list = list.filter(o => {
      const d = new Date(o.createdAt);
      if (timeFilter === '30d') {
        return (now.getTime() - d.getTime()) <= 30 * 24 * 60 * 60 * 1000;
      }
      if (timeFilter === 'current_month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      if (timeFilter === 'current_year') {
        return d.getFullYear() === now.getFullYear();
      }
      if (timeFilter === 'custom' && customDateStart && customDateEnd) {
        // Compensar fuso e englobar dia inteiro
        const start = new Date(customDateStart + 'T00:00:00').getTime();
        const end = new Date(customDateEnd + 'T23:59:59').getTime();
        return o.createdAt >= start && o.createdAt <= end;
      }
      return true; // "all" ou fallback
    });

    // 2. Status Filter
    if (!filterAll) {
      list = list.filter(o => {
        const isOpen = OPEN_STATUSES.includes(o.status);
        const isCheck = CHECK_STATUSES.includes(o.status);
        const isDone = DONE_STATUSES.includes(o.status);
        if (filterOpen && isOpen) return true;
        if (filterCheck && isCheck) return true;
        if (filterDone && isDone) return true;
        return false;
      });
    }

    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [purchaseOrders, timeFilter, customDateStart, customDateEnd, filterAll, filterOpen, filterCheck, filterDone]);

  // ── DYNAMIC GRID COLUMNS ─────────────────────────────────────────────────

  const gridColumns = useMemo(() => {
    if (filterAll) return [{ title: 'Todos os Pedidos', items: filteredOrders, id: 'all' }];
    
    const cols = [];
    if (filterOpen) {
      cols.push({
        title: 'Em Aberto', id: 'open',
        items: filteredOrders.filter(o => OPEN_STATUSES.includes(o.status))
      });
    }
    if (filterCheck) {
      cols.push({
        title: 'A Conferir', id: 'check',
        items: filteredOrders.filter(o => CHECK_STATUSES.includes(o.status))
      });
    }
    if (filterDone) {
      cols.push({
        title: 'Lançados / Concluídos', id: 'done',
        items: filteredOrders.filter(o => DONE_STATUSES.includes(o.status))
      });
    }
    return cols;
  }, [filteredOrders, filterAll, filterOpen, filterCheck, filterDone]);

  // ── ACTIONS ──────────────────────────────────────────────────────────────

  const transition = (orderId: string, to: PurchaseOrderStatus, extra?: Partial<PurchaseOrder>) => {
    const now = Date.now();
    setPurchaseOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      return {
        ...o,
        status: to,
        updatedAt: now,
        transitions: [...(o.transitions || []), { from: o.status, to, timestamp: now, note: extra?.cancelNote }],
        ...extra,
      };
    }));
  };

  const handleCancel = (orderId: string) => {
    if (!cancelReason) return;
    transition(orderId, 'cancelled', { cancelReason, cancelNote });
    setShowCancelModal(false);
    setCancelReason('');
    setCancelNote('');
  };

  const toggleSelection = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const n = new Set(prev);
      if (n.has(orderId)) n.delete(orderId); else n.add(orderId);
      return n;
    });
  };

  const confirmDelete = () => {
    setPurchaseOrders(prev => prev.filter(o => !selectedOrderIds.has(o.id)));
    setSelectedOrderIds(new Set());
    setShowDeleteConfirm(false);
  };

  const handleBulkAction = (action: 'enter_system' | 'check' | 'delete') => {
    if (action === 'delete') {
      setShowDeleteConfirm(true);
      return;
    }
    
    const targetStatus: PurchaseOrderStatus = action === 'enter_system' ? 'entered_system' : 'received';
    const now = Date.now();
    
    setPurchaseOrders(prev => prev.map(o => {
      if (!selectedOrderIds.has(o.id)) return o;
      return {
        ...o,
        status: targetStatus,
        updatedAt: now,
        transitions: [...(o.transitions || []), { from: o.status, to: targetStatus, timestamp: now, note: 'Bulk action' }],
      };
    }));
    setSelectedOrderIds(new Set());
  };

  // ── UPLOAD / OCR LOGIC ───────────────────────────────────────────────────

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!uploadSupplierId) {
      alert("Selecione um fornecedor antes de importar a nota.");
      return;
    }
    const supplier = suppliers.find(s => s.id === uploadSupplierId);
    if (!supplier) return;

    const { quotes, detectedDate, errorMessage } = await processFile(file, supplier, globalPackRules);
    
    if (errorMessage) {
      alert(`Erro no OCR: ${errorMessage}`);
      return;
    }
    if (!quotes || quotes.length === 0) {
      alert("Nenhum item encontrado no arquivo.");
      return;
    }

    // Convert ProductQuote[] to CartItem[]
    const items: CartItem[] = quotes.map((q, i) => {
       const qty = q.packQuantity > 0 ? q.packQuantity : 1;
       const unitPrice = q.priceStrategy === 'unit' ? q.unitPrice : (q.price / qty);
       const packPrice = q.priceStrategy === 'pack' ? q.price : (unitPrice * qty);
       
       return {
         id: `ext-${Date.now()}-${i}`,
         sku: q.sku || q.name.substring(0,10),
         productName: q.name,
         supplierId: supplier.id,
         supplierName: supplier.name,
         packQuantity: qty,
         packPrice: packPrice,
         quantityToBuy: q.quantityBought ?? 1,
         totalCost: packPrice * (q.quantityBought ?? 1)
       };
    });

    const totalValue = items.reduce((s, i) => s + i.totalCost, 0);
    const now = Date.now();
    
    // Check if there are pending orders for this supplier
    const pendingOrders = purchaseOrders.filter(o => o.supplierId === supplier.id && (o.status === 'draft' || o.status === 'sent'));
    
    if (pendingOrders.length > 0) {
       setLinkInvoiceData({
         file,
         supplierId: supplier.id,
         items,
         detectedDate: detectedDate || null,
         pendingOrders
       });
       setShowUploadModal(false);
       setUploadSupplierId('');
       setUploadSupplierSearch('');
       return;
    }
    
    // Fallback: create standalone external order
    createStandaloneInvoice(file, supplier, items, detectedDate || now, totalValue);
  };

  const createStandaloneInvoice = (file: File, supplier: Supplier, items: CartItem[], createdAt: number, totalValue: number) => {
    const newOrder: PurchaseOrder = {
      id: crypto.randomUUID(),
      seqNumber: getNextSeqNumber?.(),
      supplierId: supplier.id,
      supplierName: supplier.name,
      items,
      totalValue,
      status: 'received_unchecked', // Status inicial para notas importadas
      createdAt,
      updatedAt: Date.now(),
      deliveryOrPickup: 'delivery',
      origin: 'external',
      transitions: [],
      documentUrl: URL.createObjectURL(file) 
    };

    setPurchaseOrders(prev => [newOrder, ...prev]);
    setShowUploadModal(false);
    setUploadSupplierId('');
    setUploadSupplierSearch('');
  };

  const handleLinkInvoice = (orderId: string) => {
    if (!linkInvoiceData) return;
    const { items, file } = linkInvoiceData;
    const now = Date.now();
    
    setPurchaseOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      return {
        ...o,
        status: 'received_unchecked',
        updatedAt: now,
        originalSnapshot: o.originalSnapshot || o.items, // Keep original intact
        invoicedSnapshot: items, // Save XML truth
        items: items, // The current reality is now the invoice (until physical check)
        documentUrl: URL.createObjectURL(file),
        totalValue: items.reduce((s, i) => s + i.totalCost, 0),
        transitions: [...(o.transitions || []), { from: o.status, to: 'received_unchecked', timestamp: now, note: 'NF importada e vinculada' }],
      };
    }));
    setLinkInvoiceData(null);
  };

  // ── MANUAL ORDER LOGIC ───────────────────────────────────────────────────

  const getItemPrice = (productId: string, lastPackPrice: number, packQuantity: number) => {
    return manualPrices[productId] ?? {
      packPrice: lastPackPrice,
      unitPrice: lastPackPrice / (packQuantity || 1),
    };
  };

  const updatePackPrice = (productId: string, packPrice: number, packQuantity: number) => {
    setManualPrices(prev => ({
      ...prev,
      [productId]: { packPrice, unitPrice: packPrice / (packQuantity || 1) },
    }));
  };

  const updateUnitPrice = (productId: string, unitPrice: number, packQuantity: number) => {
    setManualPrices(prev => ({
      ...prev,
      [productId]: { unitPrice, packPrice: unitPrice * (packQuantity || 1) },
    }));
  };

  const manualFilteredProducts = useMemo(() => {
    const catalog = supplierCatalogs[manualSupplierId];
    if (!catalog) return [];
    const q = manualSearch.toLowerCase();
    return catalog.products.filter(p => p.name.toLowerCase().includes(q));
  }, [supplierCatalogs, manualSupplierId, manualSearch]);

  const createManualOrder = () => {
    const supplier = suppliers.find(s => s.id === manualSupplierId);
    const catalog = supplierCatalogs[manualSupplierId];
    if (!supplier || !catalog) return;

    const items: CartItem[] = (Object.entries(manualQtys) as [string, number][])
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => {
        const p = catalog.products.find(pr => pr.id === productId)!;
        const priceData = getItemPrice(productId, p.lastPackPrice, p.packQuantity || 1);
        return {
          id: `${manualSupplierId}-${p.name}-${p.packQuantity}`,
          sku: p.supplierSku || p.name.substring(0, 10),
          productName: p.name,
          supplierId: manualSupplierId,
          supplierName: supplier.name,
          packQuantity: p.packQuantity || 1,
          packPrice: priceData.packPrice,
          quantityToBuy: qty,
          totalCost: priceData.packPrice * qty,
        };
      });

    if (items.length === 0) return;

    const now = Date.now();
    const newOrder: PurchaseOrder = {
      id: crypto.randomUUID(),
      seqNumber: getNextSeqNumber?.(),
      supplierId: manualSupplierId,
      supplierName: supplier.name,
      items,
      totalValue: items.reduce((s, i) => s + i.packPrice * i.quantityToBuy, 0),
      status: manualInitialStatus,
      createdAt: now,
      updatedAt: now,
      deliveryOrPickup: 'delivery',
      notes: manualNotes || undefined,
      transitions: manualInitialStatus !== 'draft'
        ? [{ from: 'draft' as PurchaseOrderStatus, to: manualInitialStatus, timestamp: now, note: 'Criado diretamente como "A Conferir"' }]
        : [],
    };
    setPurchaseOrders(prev => [newOrder, ...prev]);
    setShowManualModal(false);
    setManualSupplierId('');
    setManualQtys({});
    setManualPrices({});
    setManualNotes('');
    setManualInitialStatus('draft');
  };

  const handleSaveCheck = (updatedItems: CartItem[], note: string) => {
    if (!checkingOrder) return;
    const now = Date.now();
    const newTotal = updatedItems.reduce((s, i) => s + i.totalCost, 0);
    
    setPurchaseOrders(prev => prev.map(o => {
      if (o.id !== checkingOrder.id) return o;
      return {
        ...o,
        status: 'fully_checked',
        updatedAt: now,
        items: updatedItems, // Nova realidade (físico)
        totalValue: newTotal,
        notes: (o.notes ? o.notes + '\n' : '') + (note ? `[Divergência/Conferência]: ${note}` : ''),
        transitions: [...(o.transitions || []), { from: o.status, to: 'fully_checked', timestamp: now, note: 'Conferência Física Salva. ' + (note ? 'Com divergência' : 'Sem divergência') }],
      };
    }));
    setCheckingOrder(null);
  };

  // ── RENDERERS ────────────────────────────────────────────────────────────

  const renderStatusBadge = (status: PurchaseOrderStatus) => (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border truncate max-w-full inline-block text-center ${STATUS_COLOR[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );

  const renderOrderRow = (order: PurchaseOrder) => {
    const isExpanded = expandedOrderId === order.id;
    const isChecked = selectedOrderIds.has(order.id);
    const supplier = suppliers.find(s => s.id === order.supplierId);
    const actions = NEXT_ACTIONS[order.status] || [];

    // Verificação de divergência de preço ⚠️ (com validade)
    let hasPriceAlert = false;
    if (order.origin === 'external' && supplierCatalogs[order.supplierId]) {
      const catalog = supplierCatalogs[order.supplierId];
      // Exemplo: consideramos um histórico fresco como < 14 dias
      order.items.forEach(item => {
         const p = catalog.products.find(cp => cp.name === item.productName || cp.supplierSku === item.sku);
         if (p && p.lastPackPrice > 0) {
           const diff = (item.packPrice - p.lastPackPrice) / p.lastPackPrice;
           const age = Date.now() - p.lastSeenDate;
           if (diff > 0.05 && age < 14 * 86400000) {
             hasPriceAlert = true;
           }
         }
      });
    }

    return (
      <div key={order.id} className={`flex flex-col border-b border-slate-800/60 transition-colors bg-slate-900 ${isExpanded ? 'bg-slate-800/30' : 'hover:bg-slate-800/50'} ${isChecked ? 'bg-amber-900/10' : ''}`}>
        {/* ROW PRINCIPAL (Alta Densidade - 2 Linhas para suportar 3 colunas sem scroll horizontal) */}
        <div className="flex flex-col px-3 py-2.5 cursor-pointer gap-2 min-h-[56px]" onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}>
          {/* Linha 1: Checkbox + Fornecedor + Chevron */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div onClick={e => e.stopPropagation()} className="shrink-0 flex items-center justify-center pt-0.5">
                <button onClick={() => toggleSelection(order.id)} className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${isChecked ? 'bg-amber-600 border-amber-600 text-white' : 'border-slate-600 hover:border-amber-500'}`}>
                  {isChecked && <Check className="w-3 h-3 stroke-[3]"/>}
                </button>
              </div>
              <span className="font-bold text-slate-200 text-[13px] truncate leading-tight">{order.supplierName}</span>
              {order.origin === 'external' && (
                <span className="bg-purple-900/40 text-purple-400 border border-purple-800 px-1 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider shrink-0" title="Importado via arquivo (XML/PDF)">Ext</span>
              )}
            </div>
            <div className="shrink-0 text-slate-500 pt-0.5">
              <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </div>

          {/* Linha 2: Badge + Ícones + Dados (Data, Vol, Total) */}
          <div className="flex items-center justify-between gap-2 pl-[26px]">
            <div className="flex items-center gap-1.5 overflow-hidden">
              {renderStatusBadge(order.status)}
              {order.documentUrl && (
                <a href={order.documentUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-slate-500 hover:text-amber-400 shrink-0" title="Ver Documento Original">
                  <FileText className="w-3.5 h-3.5"/>
                </a>
              )}
              {hasPriceAlert && (
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" title="Divergência de preço >5% em relação à cotação recente!"/>
              )}
            </div>
            
            <div className="flex items-center gap-2.5 shrink-0 text-right text-[11px] text-slate-400">
              <span className="hidden xl:inline-block">{fmtDate(order.createdAt)}</span>
              <span className="hidden sm:inline-block">{order.items.length} vol.</span>
              <span className="font-bold text-slate-200 text-[12px]">{fmtCurrency(order.totalValue)}</span>
            </div>
          </div>
        </div>

        {/* EXPANDED ÁREA */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-2 space-y-3 cursor-default border-t border-slate-800/40" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-950/50 rounded-lg overflow-hidden border border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50">
                    <th className="text-left p-2 text-slate-500 font-medium">Produto</th>
                    <th className="text-center p-2 text-slate-500 font-medium w-16">Qtd</th>
                    <th className="text-right p-2 text-slate-500 font-medium w-20">Valor Lote</th>
                    <th className="text-right p-2 text-slate-500 font-medium w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.slice(0, 3).map((item, i) => (
                    <tr key={i} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20">
                      <td className="p-2 text-slate-300">
                         {item.productName}
                         <span className="text-[10px] text-slate-600 ml-2">(cx {item.packQuantity})</span>
                      </td>
                      <td className="p-2 text-center text-white font-bold">{item.quantityToBuy}</td>
                      <td className="p-2 text-right text-slate-400">{fmtCurrency(item.packPrice)}</td>
                      <td className="p-2 text-right text-amber-400 font-semibold">{fmtCurrency(item.totalCost)}</td>
                    </tr>
                  ))}
                  {order.items.length > 3 && (
                    <tr>
                      <td colSpan={4} className="p-2 text-center">
                        <button
                          onClick={() => setViewingOrder(order)}
                          className="text-xs text-slate-500 hover:text-amber-400 transition-colors"
                        >
                          Mais {order.items.length - 3} produto(s) — <span className="underline">ver mais...</span>
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Ações Locais */}
            <div className="flex items-center gap-2 flex-wrap pt-2">
              {actions.map(action => (
                <button key={action.to} onClick={() => transition(order.id, action.to)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold hover:border-amber-600 hover:text-white transition-colors">
                  {action.icon} {action.label}
                </button>
              ))}

              {!['cancelled', 'fully_checked'].includes(order.status) && (
                 <button onClick={() => setCheckingOrder(order)}
                   className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900/30 border border-blue-800/50 text-blue-400 text-xs hover:bg-blue-900/60 transition-colors font-semibold ml-auto">
                   📝 Conferir Carga
                 </button>
              )}

              {(!['fully_checked','cancelled'].includes(order.status) && order.origin !== 'external') && (
                <button onClick={() => { setExpandedOrderId(order.id); setShowCancelModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 text-xs hover:bg-red-950/60 transition-colors ml-2">
                  <XCircle className="w-3.5 h-3.5"/> Cancelar pedido
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── MAIN RETURN ──────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col relative overflow-hidden bg-slate-950">
      
      {/* ── UNIFIED COMPACT HEADER ── */}
      <div className="shrink-0 px-6 py-3 border-b border-slate-800 bg-slate-900/80 flex flex-col xl:flex-row xl:items-center justify-between gap-4 relative z-20 shadow-sm">
        
        {/* Left side: Title + Status Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <ClipboardList className="w-5 h-5 text-amber-500"/>
            <h2 className="text-white font-bold text-lg tracking-tight">Pedidos & Entradas</h2>
          </div>
          
          <div className="w-px h-5 bg-slate-700 hidden sm:block"></div>

          {/* Status Checkboxes */}
          <div className="flex items-center gap-3 shrink-0">
            <label className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors ${filterAll ? 'text-amber-400' : 'text-slate-400 hover:text-slate-300'}`}>
              <input type="checkbox" checked={filterAll} onChange={e => { setFilterAll(e.target.checked); if(e.target.checked){ setFilterOpen(true); setFilterCheck(true); setFilterDone(false); } }} className="hidden" />
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${filterAll ? 'bg-amber-600 border-amber-600' : 'border-slate-600'}`}>
                {filterAll && <Check className="w-2.5 h-2.5 text-white stroke-[3]"/>}
              </div>
              Todos
            </label>
            <div className="w-px h-3 bg-slate-800 mx-1"></div>
            
            <label className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors ${(!filterAll && filterOpen) ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
              <input type="checkbox" checked={filterOpen} onChange={e => { setFilterOpen(e.target.checked); setFilterAll(false); }} className="hidden" />
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${(!filterAll && filterOpen) ? 'bg-blue-600 border-blue-600' : 'border-slate-600'}`}>
                {(!filterAll && filterOpen) && <Check className="w-2.5 h-2.5 text-white stroke-[3]"/>}
              </div>
              Em Aberto
            </label>
            
            <label className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors ${(!filterAll && filterCheck) ? 'text-yellow-400' : 'text-slate-500 hover:text-slate-300'}`}>
              <input type="checkbox" checked={filterCheck} onChange={e => { setFilterCheck(e.target.checked); setFilterAll(false); }} className="hidden" />
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${(!filterAll && filterCheck) ? 'bg-yellow-600 border-yellow-600' : 'border-slate-600'}`}>
                {(!filterAll && filterCheck) && <Check className="w-2.5 h-2.5 text-white stroke-[3]"/>}
              </div>
              A Conferir
            </label>

            <label className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors ${(!filterAll && filterDone) ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'}`}>
              <input type="checkbox" checked={filterDone} onChange={e => { setFilterDone(e.target.checked); setFilterAll(false); }} className="hidden" />
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${(!filterAll && filterDone) ? 'bg-green-600 border-green-600' : 'border-slate-600'}`}>
                {(!filterAll && filterDone) && <Check className="w-2.5 h-2.5 text-white stroke-[3]"/>}
              </div>
              Lançados
            </label>
          </div>
        </div>

        {/* Right side: Time Filters + Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-500"/>
            <select value={timeFilter} onChange={e => setTimeFilter(e.target.value as any)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-amber-500">
              <option value="30d">Últimos 30 dias</option>
              <option value="current_month">Mês Atual</option>
              <option value="current_year">Neste Ano</option>
              <option value="all">Todo o período</option>
              <option value="custom">Personalizado</option>
            </select>
            {timeFilter === 'custom' && (
               <div className="flex items-center gap-1">
                 <input type="date" value={customDateStart} onChange={e => setCustomDateStart(e.target.value)} className="bg-slate-900 border border-slate-700 rounded text-[10px] px-1 py-1 text-slate-300 focus:outline-none"/>
                 <span className="text-slate-500 text-[10px]">até</span>
                 <input type="date" value={customDateEnd} onChange={e => setCustomDateEnd(e.target.value)} className="bg-slate-900 border border-slate-700 rounded text-[10px] px-1 py-1 text-slate-300 focus:outline-none"/>
               </div>
            )}
          </div>

          <div className="w-px h-5 bg-slate-700 hidden sm:block"></div>

          <button onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[13px] font-semibold transition-all shadow-lg shadow-purple-900/20 shrink-0">
            <UploadCloud className="w-4 h-4"/> Importar NF
          </button>
          <button onClick={() => setShowManualModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 text-[13px] font-semibold transition-colors shrink-0">
            <Plus className="w-4 h-4"/> Novo
          </button>
        </div>
      </div>

      {/* ── BULK ACTIONS FLOATING BAR ── */}
      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded-full shadow-2xl px-4 py-2 flex items-center gap-4 animate-in slide-in-from-bottom-4">
           <span className="text-amber-400 font-bold text-sm">{selectedOrderIds.size} selecionados</span>
           <div className="w-px h-4 bg-slate-600"></div>
           <button onClick={() => handleBulkAction('check')} className="text-xs text-slate-200 font-semibold hover:text-white px-2 transition-colors">Marcar Conferido</button>
           <button onClick={() => handleBulkAction('enter_system')} className="text-xs text-slate-200 font-semibold hover:text-white px-2 transition-colors">Lançar Sistema</button>
           <button onClick={() => handleBulkAction('delete')} className="text-xs text-red-400 font-semibold hover:text-red-300 px-2 flex items-center gap-1 transition-colors"><Trash2 className="w-3.5 h-3.5"/> Deletar</button>
           <button onClick={() => setSelectedOrderIds(new Set())} className="text-slate-500 hover:text-white ml-2 p-1 transition-colors"><X className="w-4 h-4"/></button>
        </div>
      )}

      {/* ── DYNAMIC GRID CONTENT ── */}
      <div className="flex-1 overflow-hidden px-6 py-4 z-10">
        <div className="h-full flex gap-4 items-start w-full">
           {gridColumns.length === 0 && (
             <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 pb-20">
               <LayoutGrid className="w-12 h-12 mb-3 opacity-20"/>
               <p className="text-sm">Selecione pelo menos um status acima para visualizar.</p>
             </div>
           )}

           {gridColumns.map(col => (
             <div key={col.id} className="flex flex-col h-full bg-slate-900/30 border border-slate-800/60 rounded-xl overflow-hidden" style={{ flex: 1, minWidth: 0 }}>
               <div className="shrink-0 px-4 py-2.5 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between shadow-sm">
                 <h3 className="font-bold text-slate-300 text-sm tracking-wide uppercase">{col.title}</h3>
                 <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-bold">{col.items.length}</span>
               </div>
               
               <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-2 space-y-1.5">
                 {col.items.length === 0 ? (
                    <div className="text-center py-10 text-slate-600 text-xs">Nenhum pedido nesta visão.</div>
                 ) : (
                    col.items.map(renderOrderRow)
                 )}
               </div>
             </div>
           ))}
        </div>
      </div>

      {/* ── MODALS (Upload) ── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-900/40 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-purple-900/10">
              <h3 className="font-bold text-white flex items-center gap-2"><UploadCloud className="w-5 h-5 text-purple-400"/> Importar Nota Externa</h3>
              <button onClick={() => setShowUploadModal(false)}><X className="w-5 h-5 text-slate-500 hover:text-white"/></button>
            </div>
            <div className="p-5 space-y-5">
              
              {/* Seleção de Fornecedor */}
              <div className="relative" ref={uploadSupplierRef}>
                <label className="text-xs text-slate-400 block mb-1">Selecione o Fornecedor Origem *</label>
                <button type="button" onClick={() => setUploadSupplierOpen(o => !o)}
                  className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm transition-colors ${!uploadSupplierId ? 'bg-slate-800/60 border-slate-700 text-slate-400' : 'bg-slate-800 border-purple-500/50 text-white'}`}>
                  <span className="truncate">{uploadSupplierId ? suppliers.find(s => s.id === uploadSupplierId)?.name : 'Selecionar fornecedor...'}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${uploadSupplierOpen ? 'rotate-180' : ''}`}/>
                </button>
                {uploadSupplierOpen && (
                  <div className="absolute top-full left-0 z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-slate-700 relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
                      <input type="text" autoFocus placeholder="Buscar..." value={uploadSupplierSearch} onChange={e => setUploadSupplierSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white focus:outline-none"/>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {suppliers.filter(s => s.name.toLowerCase().includes(uploadSupplierSearch.toLowerCase())).map(s => (
                        <button key={s.id} type="button" onClick={() => { setUploadSupplierId(s.id); setUploadSupplierOpen(false); }} className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${uploadSupplierId === s.id ? 'bg-purple-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Dropzone */}
              <div 
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all ${!uploadSupplierId ? 'opacity-50 pointer-events-none border-slate-800 bg-slate-900/50' : isDragging ? 'border-purple-500 bg-purple-900/20' : 'border-slate-700 hover:border-purple-500/50 hover:bg-slate-800/50'}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                 {isProcessing ? (
                   <div className="flex flex-col items-center gap-3 py-2">
                     <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                     <p className="text-sm font-semibold text-purple-400">Processando documento via IA...</p>
                   </div>
                 ) : (
                   <>
                     <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                       <UploadCloud className="w-6 h-6 text-purple-400"/>
                     </div>
                     <p className="text-sm font-bold text-white mb-1">Arraste a nota fiscal (PDF/XML/Img)</p>
                     <p className="text-xs text-slate-500 mb-4">A inteligência extrairá os itens, quantidades e valores.</p>
                     <label className="cursor-pointer bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors">
                       Procurar arquivo
                       <input type="file" className="hidden" accept=".pdf,.xml,image/*" onChange={e => { if(e.target.files?.length) handleFileUpload(e.target.files[0]); }}/>
                     </label>
                   </>
                 )}
              </div>
              
              <div className="text-xs text-slate-500 flex items-start gap-2 bg-slate-800/30 p-3 rounded-lg border border-slate-800/60">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"/>
                <p>O pedido será criado como <strong>A Conferir</strong>. Verifique se as unidades por caixa lidas pelo OCR bateram corretamente com sua forma de compra padrão.</p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── MODALS (Novo Pedido Manual Simplificado) ── */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400"/>
                <h3 className="font-bold text-white">Novo Pedido Manual</h3>
              </div>
              <button onClick={() => { setShowManualModal(false); setManualSupplierId(''); setManualSearch(''); setManualQtys({}); setManualPrices({}); setManualNotes(''); setManualInitialStatus('draft'); setManualSupplierSearch(''); setManualSupplierOpen(false); }}>
                <X className="w-5 h-5 text-slate-500 hover:text-white"/>
              </button>
            </div>
            
            <div className="flex flex-1 min-h-0">
              <div className="flex flex-col flex-[3] p-4 gap-3 border-r border-slate-800 min-h-0">
                <div className="relative shrink-0" ref={manualSupplierRef}>
                  <label className="text-xs text-slate-400 block mb-1">Fornecedor</label>
                  <button type="button" onClick={() => setManualSupplierOpen(o => !o)}
                    className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm transition-colors ${!manualSupplierId ? 'bg-slate-800/60 border-slate-700 text-slate-400' : 'bg-slate-800 border-amber-600/50 text-white'}`}>
                    <span className="truncate">{manualSupplierId ? suppliers.find(s => s.id === manualSupplierId)?.name : 'Selecionar...'}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${manualSupplierOpen ? 'rotate-180' : ''}`}/>
                  </button>
                  {manualSupplierOpen && (
                    <div className="absolute top-full left-0 z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                      <div className="p-2 border-b border-slate-700 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
                        <input type="text" autoFocus placeholder="Buscar..." value={manualSupplierSearch} onChange={e => setManualSupplierSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white focus:outline-none"/>
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        {suppliers.filter(s => s.name.toLowerCase().includes(manualSupplierSearch.toLowerCase())).map(s => (
                          <button key={s.id} type="button" onClick={() => { setManualSupplierId(s.id); setManualSearch(''); setManualQtys({}); setManualPrices({}); setManualSupplierOpen(false); setManualSupplierSearch(''); }} className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${manualSupplierId === s.id ? 'bg-amber-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}>
                            {manualSupplierId === s.id && <Check className="w-3.5 h-3.5 shrink-0"/>}
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {manualSupplierId && (
                  <div className="relative shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"/>
                    <input type="text" placeholder="Buscar produto..." value={manualSearch} onChange={e => setManualSearch(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto min-h-0">
                  {manualFilteredProducts.map(p => {
                    const qty = manualQtys[p.id] || 0;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-all hover:bg-slate-800/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate text-slate-200">{p.name}</p>
                          <p className="text-slate-500 text-[10px]">Cx {p.packQuantity} · {fmtCurrency(p.lastPackPrice)}/cx</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setManualQtys(prev => { const n = { ...prev }; if ((n[p.id] || 0) <= 1) delete n[p.id]; else n[p.id]--; return n; })} className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 flex items-center justify-center">−</button>
                          <input
                            type="number"
                            min="0"
                            value={qty === 0 ? '' : qty}
                            onChange={e => {
                              const v = Math.max(0, parseInt(e.target.value) || 0);
                              setManualQtys(prev => { const n = { ...prev }; if (v === 0) delete n[p.id]; else n[p.id] = v; return n; });
                            }}
                            className="w-9 text-center bg-slate-800 border border-slate-700 rounded text-white text-xs font-semibold focus:outline-none focus:border-amber-500 py-0.5"
                          />
                          <button onClick={() => setManualQtys(prev => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))} className="w-6 h-6 rounded bg-slate-700 hover:bg-amber-600 text-slate-300 hover:text-white flex items-center justify-center text-sm">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col flex-[2] p-4 min-h-0">
                <p className="text-xs text-slate-400 font-semibold mb-2 shrink-0">Resumo do Pedido</p>

                {/* Tabela de itens com preços editáveis */}
                <div className="flex-1 overflow-y-auto min-h-0 mb-3">
                  {Object.keys(manualQtys).length === 0 ? (
                    <p className="text-xs text-slate-600 text-center pt-6">Adicione produtos →</p>
                  ) : (
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-800">
                          <th className="text-left pb-1.5 font-medium">Produto</th>
                          <th className="text-center pb-1.5 font-medium w-7">Cx</th>
                          <th className="text-center pb-1.5 font-medium w-10">Qtd</th>
                          <th className="text-right pb-1.5 font-medium w-[72px]">Preço un</th>
                          <th className="text-right pb-1.5 font-medium w-[72px]">Preço cx</th>
                          <th className="text-right pb-1.5 font-medium w-14">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Object.entries(manualQtys) as [string, number][]).map(([productId, qty]) => {
                          const p = supplierCatalogs[manualSupplierId]?.products.find(pr => pr.id === productId);
                          if (!p) return null;
                          const pd = getItemPrice(productId, p.lastPackPrice, p.packQuantity || 1);
                          return (
                            <tr key={productId} className="border-b border-slate-800/50 last:border-0">
                              <td className="py-1.5 pr-1">
                                <p className="text-slate-300 truncate max-w-[90px]" title={p.name}>{p.name}</p>
                              </td>
                              <td className="text-center text-slate-500">{p.packQuantity || 1}</td>
                              <td className="text-center">
                                <input
                                  type="number" min="1"
                                  value={qty}
                                  onChange={e => { const v = Math.max(1, parseInt(e.target.value) || 1); setManualQtys(prev => ({ ...prev, [productId]: v })); }}
                                  className="w-10 text-center bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-amber-500 py-0.5"
                                />
                              </td>
                              <td className="text-right">
                                <input
                                  type="number" step="0.01" min="0"
                                  value={pd.unitPrice.toFixed(2)}
                                  onChange={e => updateUnitPrice(productId, parseFloat(e.target.value) || 0, p.packQuantity || 1)}
                                  className="w-[68px] text-right bg-slate-800 border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-amber-500 px-1 py-0.5"
                                />
                              </td>
                              <td className="text-right">
                                <input
                                  type="number" step="0.01" min="0"
                                  value={pd.packPrice.toFixed(2)}
                                  onChange={e => updatePackPrice(productId, parseFloat(e.target.value) || 0, p.packQuantity || 1)}
                                  className="w-[68px] text-right bg-slate-800 border border-amber-700/40 rounded text-white focus:outline-none focus:border-amber-500 px-1 py-0.5"
                                />
                              </td>
                              <td className="text-right text-amber-400 font-semibold pl-1">
                                {fmtCurrency(pd.packPrice * qty)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="shrink-0 space-y-3">
                  {/* Status inicial */}
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 uppercase font-semibold tracking-wide">Status inicial</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setManualInitialStatus('draft')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${manualInitialStatus === 'draft' ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:border-slate-500'}`}
                      >
                        Rascunho
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualInitialStatus('received_unchecked')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${manualInitialStatus === 'received_unchecked' ? 'bg-yellow-900/40 border-yellow-700/50 text-yellow-400' : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:border-slate-500'}`}
                      >
                        Já chegou (A Conferir)
                      </button>
                    </div>
                  </div>

                  {/* Observações */}
                  <textarea
                    value={manualNotes}
                    onChange={e => setManualNotes(e.target.value)}
                    placeholder="Observações (opcional)..."
                    rows={2}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500 resize-none"
                  />

                  <div className="flex justify-between items-center border-t border-slate-700 pt-2">
                    <span className="text-xs text-slate-400">Total</span>
                    <span className="text-sm font-bold text-white">
                      {fmtCurrency((Object.entries(manualQtys) as [string, number][]).reduce((s, [id, qty]) => {
                        const p = supplierCatalogs[manualSupplierId]?.products.find(pr => pr.id === id);
                        const pd = getItemPrice(id, p?.lastPackPrice || 0, p?.packQuantity || 1);
                        return s + pd.packPrice * qty;
                      }, 0))}
                    </span>
                  </div>
                  <button onClick={createManualOrder} disabled={!manualSupplierId || Object.keys(manualQtys).length === 0}
                    className="w-full px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
                    Criar Pedido
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS (Vincular Nota Fiscal a Pedido) ── */}
      {linkInvoiceData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-600/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-purple-900/10">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-purple-400"/>
                <h3 className="font-bold text-white text-lg">Vincular Nota Fiscal</h3>
              </div>
              <button onClick={() => setLinkInvoiceData(null)} className="text-slate-500 hover:text-white"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto custom-scrollbar bg-slate-950/30">
              <p className="text-sm text-slate-300 mb-4 leading-relaxed">
                Encontramos pedidos em aberto para o fornecedor <strong className="text-white">{suppliers.find(s=>s.id === linkInvoiceData.supplierId)?.name}</strong>. 
                Deseja vincular os itens desta nota a um pedido existente (realizando o cruzamento automático) ou lançar como nota avulsa?
              </p>
              
              <div className="space-y-3">
                {linkInvoiceData.pendingOrders.map(po => (
                  <button key={po.id} onClick={() => handleLinkInvoice(po.id)} 
                    className="w-full text-left p-3 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-amber-500/50 transition-colors flex justify-between items-center group">
                    <div>
                      <div className="text-slate-200 font-bold text-sm group-hover:text-amber-400 transition-colors">Pedido de {fmtDate(po.createdAt)}</div>
                      <div className="text-slate-400 text-xs mt-1">{po.items.length} itens • {fmtCurrency(po.totalValue)}</div>
                      <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">{STATUS_LABEL[po.status]}</div>
                    </div>
                    <span className="text-amber-500 text-xs font-bold px-3 py-1.5 bg-amber-500/10 rounded-lg group-hover:bg-amber-500/20 transition-colors">Vincular</span>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
              <button onClick={() => setLinkInvoiceData(null)} className="px-4 py-2 text-slate-400 hover:text-white text-sm font-semibold transition-colors">
                Cancelar
              </button>
              <button onClick={() => {
                  createStandaloneInvoice(linkInvoiceData.file, suppliers.find(s=>s.id === linkInvoiceData.supplierId)!, linkInvoiceData.items, linkInvoiceData.detectedDate || Date.now(), linkInvoiceData.items.reduce((s,i)=>s+i.totalCost,0));
                  setLinkInvoiceData(null);
                }} 
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/20 transition-all">
                Criar Nota Avulsa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS (Cancelar Pedido) ── */}
      {showCancelModal && expandedOrderId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-900/40 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400"/> Cancelar Pedido</h3>
              <button onClick={() => setShowCancelModal(false)}><X className="w-5 h-5 text-slate-500 hover:text-white"/></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Motivo do cancelamento (Curto)</label>
                <select value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500">
                  <option value="">Selecione...</option>
                  <option value="supplier_out_of_stock">Fornecedor sem estoque</option>
                  <option value="price_divergence">Divergência grave de preço</option>
                  <option value="delay">Atraso inaceitável</option>
                  <option value="wrong_order">Pedido feito errado</option>
                  <option value="other">Outro</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <button onClick={() => setShowCancelModal(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white">Voltar</button>
              <button onClick={() => handleCancel(expandedOrderId)} disabled={!cancelReason}
                className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* ── MODAL: Visualizar pedido completo (read-only) ── */}
      {viewingOrder && (
        <EditOrderModal
          order={viewingOrder}
          readOnly
          onClose={() => setViewingOrder(null)}
          onSave={() => {}}
          onConfer={(o) => { setViewingOrder(null); setCheckingOrder(o); }}
        />
      )}

      {/* ── MODAL: Conferir Carga ── */}
      {checkingOrder && (
        <EditOrderModal
          order={checkingOrder}
          onClose={() => setCheckingOrder(null)}
          onSave={handleSaveCheck}
        />
      )}

      {/* ── MODAL: Confirmar exclusão ── */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Deletar pedidos?"
        message={`Você está prestes a deletar ${selectedOrderIds.size} pedido(s). Essa ação não pode ser desfeita.`}
        confirmLabel="Deletar"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

    </div>
  );
}

export default OrderManager;
