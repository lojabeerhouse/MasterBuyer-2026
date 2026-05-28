import React, { useState, useRef, useMemo, useCallback } from 'react';
import { Supplier, QuoteBatch, ProductQuote, PackRule, ProductMapping, MasterProduct, PriceValidityConfig } from '../../types';
import { Upload, Trash2, FileText, CheckCircle, Plus, Ban, Eye, Pencil, MessageCircle, MapPin, Search, Files, FilePlus, Archive, Loader2, Settings, Bot, Package, X as XIcon } from 'lucide-react';
import QuoteDetailModal from '../QuoteDetailModal';
import QuoteCard from './QuoteCard';
import SupplierEditModal from './SupplierEditModal';
import BlacklistModal from './BlacklistModal';
import PackRulesModal from './PackRulesModal';
import RawContentModal from './RawContentModal';
import { parseQuoteLocal } from '../../services/compras/parseQuoteLocal';
import { useFileProcessor, filterBlacklisted, recalculateItem, ProcessingLog } from '../../hooks/useFileProcessor';
import { useUploadQueue } from '../../hooks/useUploadQueue';
import { applyRulesToQuotes } from '../../services/compras/packRulesService';

interface SupplierManagerProps {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  globalPackRules: PackRule[];
  onBatchCompleted?: (batch: QuoteBatch, supplierId: string) => void;
  uid?: string;
  onBatchDateChange?: (supplierId: string, batchId: string, newTimestamp: number, items: ProductQuote[]) => void;
  productMappings?: ProductMapping[];
  masterProducts?: MasterProduct[];
  onAddMapping?: (normalizedName: string, targetSku: string, targetType?: 'master' | 'supplier', targetName?: string, supplierSku?: string) => void;
  onRemoveMapping?: (supplierProductName: string) => void;
  priceValidityConfig?: PriceValidityConfig;
  setPriceValidityConfig?: React.Dispatch<React.SetStateAction<PriceValidityConfig>>;
}

const SupplierManager: React.FC<SupplierManagerProps> = ({
  suppliers, setSuppliers, globalPackRules, onBatchCompleted, onBatchDateChange,
  productMappings, masterProducts, onAddMapping, onRemoveMapping,
  priceValidityConfig, setPriceValidityConfig
}) => {
  const [newSupplierName, setNewSupplierName] = useState('');
  const [activeTab, setActiveTab] = useState<string | null>(() => suppliers[0]?.id ?? null);
  const [textInput, setTextInput] = useState('');
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [quoteSortMode, setQuoteSortMode] = useState<'quoteDate' | 'uploadDate'>('quoteDate');

  // Modal open/close flags — content managed by each modal component
  const [showSupplierEdit, setShowSupplierEdit] = useState(false);
  const [showBlacklist, setShowBlacklist] = useState(false);
  const [showPackRules, setShowPackRules] = useState(false);
  const [viewingRawContent, setViewingRawContent] = useState<{ content: string; fileName: string; supplierId: string } | null>(null);
  const [viewingBatch, setViewingBatch] = useState<QuoteBatch | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { processFile } = useFileProcessor();

  // ── Processing toast ──────────────────────────────────────────────────────────
  const [processingToast, setProcessingToast] = useState<{ log: ProcessingLog; fileName: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleProcessingLog = useCallback((log: ProcessingLog, fileName: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setProcessingToast({ log, fileName });
    toastTimerRef.current = setTimeout(() => setProcessingToast(null), 5000);
  }, []);

  // ── Shared helper: insert or update a batch in a supplier's quote list ────────
  const updateSupplierQuotes = useCallback((supplierId: string, batch: QuoteBatch) => {
    setSuppliers(prev => prev.map(s => {
      if (s.id !== supplierId) return s;
      const idx = s.quotes.findIndex(q => q.id === batch.id);
      const newQuotes = [...s.quotes];
      if (idx >= 0) newQuotes[idx] = batch;
      else newQuotes.unshift(batch);
      return { ...s, quotes: newQuotes };
    }));
  }, [setSuppliers]);

  // ── Upload queue hook ─────────────────────────────────────────────────────────
  const { uploadQueue, isQueueProcessing, dragState, handleFilesSelected, handleDragOver, handleDragLeave, handleDrop } =
    useUploadQueue({ activeTab, suppliers, globalPackRules, processFile, onBatchCompleted, onBatchUpdate: updateSupplierQuotes, onProcessingLog: handleProcessingLog, fileInputRef });

  // ── Supplier CRUD ─────────────────────────────────────────────────────────────
  const addSupplier = () => {
    if (!newSupplierName.trim()) return;
    const s: Supplier = { id: crypto.randomUUID(), name: newSupplierName, isEnabled: true, quotes: [], blacklist: [], packRules: [] };
    setSuppliers(prev => [...prev, s]);
    setNewSupplierName('');
    setActiveTab(s.id);
  };

  const toggleSupplier = (id: string) =>
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, isEnabled: !s.isEnabled } : s));

  const deleteSupplier = (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este fornecedor e todo o histórico dele?')) return;
    const remaining = suppliers.filter(s => s.id !== id);
    setSuppliers(remaining);
    if (activeTab === id) setActiveTab(remaining[0]?.id ?? null);
  };

  const saveSupplierEdit = (updated: Supplier) => {
    setSuppliers(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
    setShowSupplierEdit(false);
  };

  // ── Pack rules (supplier exceptions) ─────────────────────────────────────────
  const addPackRule = (term: string, qty: number) => {
    if (!activeTab || !term.trim() || qty < 1) return;
    const rule: PackRule = { id: crypto.randomUUID(), term, quantity: qty };
    setSuppliers(prev => prev.map(s => s.id !== activeTab ? s : { ...s, packRules: [...(s.packRules || []), rule] }));
  };

  const removePackRule = (ruleId: string) => {
    if (!activeTab) return;
    setSuppliers(prev => prev.map(s => s.id !== activeTab ? s : { ...s, packRules: s.packRules?.filter(r => r.id !== ruleId) }));
  };

  const applyRulesRetroactively = () => {
    if (!activeTab) return;
    const supplier = suppliers.find(s => s.id === activeTab);
    if (!supplier) return;
    if (!confirm('Isso aplicará as Exceções e Regras Globais em TODAS as cotações deste fornecedor. Continuar?')) return;
    setSuppliers(prev => prev.map(s => {
      if (s.id !== activeTab) return s;
      const updatedQuotes = s.quotes.map(q => ({
        ...q,
        items: applyRulesToQuotes(q.items, s.packRules || [], globalPackRules),
      }));
      return { ...s, quotes: updatedQuotes };
    }));
    alert('Regras aplicadas com sucesso!');
  };

  // ── Blacklist ─────────────────────────────────────────────────────────────────
  const toggleBlacklist = (itemName: string) => {
    if (!activeTab) return;
    const supplier = suppliers.find(s => s.id === activeTab);
    if (!supplier) return;
    const currentList = supplier.blacklist || [];
    const exists = currentList.includes(itemName);
    if (exists) {
      restoreItemToBatch(activeTab, itemName);
    }
    const newList = exists ? currentList.filter(n => n !== itemName) : [...currentList, itemName];
    setSuppliers(prev => prev.map(s => s.id === activeTab ? { ...s, blacklist: newList } : s));
  };

  const restoreItemToBatch = (supplierId: string, itemName: string) => {
    setSuppliers(prev => prev.map(s => {
      if (s.id !== supplierId) return s;
      let restoreBatch = s.quotes.find(q => q.fileName === '♻️ ITENS RESTAURADOS');
      const otherQuotes = s.quotes.filter(q => q.fileName !== '♻️ ITENS RESTAURADOS');
      if (!restoreBatch) {
        restoreBatch = { id: crypto.randomUUID(), timestamp: Date.now(), sourceType: 'text', fileName: '♻️ ITENS RESTAURADOS', status: 'completed', items: [] };
      } else {
        restoreBatch = { ...restoreBatch, timestamp: Date.now() };
      }
      const restoredItem: ProductQuote = { sku: 'REST-' + Date.now().toString().slice(-4), name: itemName, price: 0, unit: 'UN', packQuantity: 1, unitPrice: 0, priceStrategy: 'pack', isVerified: false };
      return { ...s, quotes: [{ ...restoreBatch, items: [restoredItem, ...restoreBatch.items] }, ...otherQuotes] };
    }));
  };

  // ── Text paste handler ────────────────────────────────────────────────────────
  const handleTextSubmit = (supplierId: string) => {
    if (!textInput.trim()) return;
    const now = Date.now();
    const newBatch: QuoteBatch = { id: crypto.randomUUID(), timestamp: now, uploadedAt: now, sourceType: 'text', rawContent: textInput, status: 'analyzing', items: [] };
    updateSupplierQuotes(supplierId, newBatch);
    setTextInput('');
    const currentSupplier = suppliers.find(s => s.id === supplierId);
    const supplierExceptions = currentSupplier?.packRules || [];
    try {
      const localResult = parseQuoteLocal(textInput, globalPackRules, supplierExceptions);
      const quotes = filterBlacklisted(localResult.items, currentSupplier?.blacklist || []);
      const initializedQuotes = quotes.map(q => recalculateItem({ ...q, priceStrategy: q.priceStrategy ?? 'pack' }, q.priceStrategy ?? 'pack'));
      const completedBatch: QuoteBatch = {
        ...newBatch, status: 'completed', items: initializedQuotes,
        ...(localResult.detectedDate ? { detectedDate: localResult.detectedDate, timestamp: localResult.detectedDate } : {}),
      };
      updateSupplierQuotes(supplierId, completedBatch);
      onBatchCompleted?.(completedBatch, supplierId);
    } catch {
      updateSupplierQuotes(supplierId, { ...newBatch, status: 'error', errorMessage: 'Falha ao processar texto.' });
    }
  };

  // ── Raw content handlers ──────────────────────────────────────────────────────
  const handleCopyRawContent = () => {
    if (viewingRawContent) navigator.clipboard.writeText(viewingRawContent.content);
  };

  const handleDownloadRawContent = () => {
    if (!viewingRawContent) return;
    const blob = new Blob([viewingRawContent.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${viewingRawContent.fileName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportRawContent = () => {
    if (!viewingRawContent) return;
    const { content, supplierId } = viewingRawContent;
    setViewingRawContent(null);
    const currentSupplier = suppliers.find(s => s.id === supplierId);
    const supplierExceptions = currentSupplier?.packRules || [];
    const now = Date.now();
    const newBatch: QuoteBatch = { id: crypto.randomUUID(), timestamp: now, uploadedAt: now, sourceType: 'text', rawContent: content, status: 'analyzing', items: [] };
    updateSupplierQuotes(supplierId, newBatch);
    setActiveTab(supplierId);
    try {
      const localResult = parseQuoteLocal(content, globalPackRules, supplierExceptions);
      const quotes = filterBlacklisted(localResult.items, currentSupplier?.blacklist || []);
      const initializedQuotes = quotes.map(q => recalculateItem({ ...q, priceStrategy: q.priceStrategy ?? 'pack' }, q.priceStrategy ?? 'pack'));
      const completedBatch: QuoteBatch = {
        ...newBatch, status: 'completed', items: initializedQuotes,
        ...(localResult.detectedDate ? { detectedDate: localResult.detectedDate, timestamp: localResult.detectedDate } : {}),
      };
      updateSupplierQuotes(supplierId, completedBatch);
      onBatchCompleted?.(completedBatch, supplierId);
    } catch {
      updateSupplierQuotes(supplierId, { ...newBatch, status: 'error', errorMessage: 'Falha ao processar texto.' });
    }
  };

  // ── CSV download helpers ──────────────────────────────────────────────────────
  const downloadQuoteAsCsv = (batch: QuoteBatch) => {
    if (!batch.items?.length) return;
    const header = 'SKU;Produto;PrecoLista;Unidade;QtdEmbalagem;PrecoUnitarioCalculado\n';
    const rows = batch.items.map(item => {
      const listPrice = item.priceStrategy === 'unit' ? item.unitPrice : item.price;
      return `${item.sku};${item.name};"${listPrice.toFixed(2).replace('.', ',')}";${item.unit};${item.packQuantity};"${item.unitPrice.toFixed(2).replace('.', ',')}"`;
    }).join('\n');
    const a = document.createElement('a');
    a.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURI(header + rows));
    a.setAttribute('download', `Cotacao_${batch.fileName || 'Texto'}_${new Date(batch.timestamp).toLocaleDateString().replace(/\//g, '-')}.csv`);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadArchivedCsv = (batch: QuoteBatch) => {
    if (!batch.archivedCsv) return;
    const a = document.createElement('a');
    a.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(batch.archivedCsv));
    a.setAttribute('download', `Cotacao_${batch.fileName || 'Texto'}_${new Date(batch.timestamp).toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ── Stable callbacks for QuoteCard (prevent unnecessary re-renders) ───────────
  const handleViewRaw = useCallback((content: string, fileName: string, supplierId: string) => {
    setViewingRawContent({ content, fileName, supplierId });
  }, []);

  const handleOpenBatch = useCallback((quote: QuoteBatch) => {
    setViewingBatch(quote);
  }, []);

  const handleRemoveQuote = useCallback((supplierId: string, quoteId: string) => {
    if (window.confirm('Deseja apagar esta cotação?')) {
      setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, quotes: s.quotes.filter(q => q.id !== quoteId) } : s));
    }
  }, [setSuppliers]);

  const handleDownloadCsv = useCallback((batch: QuoteBatch) => {
    downloadQuoteAsCsv(batch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownloadArchived = useCallback((batch: QuoteBatch) => {
    downloadArchivedCsv(batch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────────
  const selectedSupplier = suppliers.find(s => s.id === activeTab);

  const filteredQuotes = useMemo(() => {
    if (!selectedSupplier) return [];
    return [...selectedSupplier.quotes]
      .filter(q => {
        if (!historySearchTerm) return true;
        const tokens = historySearchTerm.toLowerCase().split(/\s+/).filter(Boolean);
        const name = (q.fileName || 'Texto Colado').toLowerCase();
        const items = q.archivedCsv ? q.archivedCsv.toLowerCase() : q.items.map(i => i.name.toLowerCase()).join(' ');
        return tokens.every(t => name.includes(t) || items.includes(t));
      })
      .sort((a, b) =>
        quoteSortMode === 'uploadDate'
          ? (b.uploadedAt ?? b.timestamp) - (a.uploadedAt ?? a.timestamp)
          : b.timestamp - a.timestamp
      );
  }, [selectedSupplier?.quotes, historySearchTerm, quoteSortMode]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full relative">
        <style>{`@keyframes progressFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }`}</style>

        {/* ── Modals ── */}
        {showSupplierEdit && selectedSupplier && (
          <SupplierEditModal
            supplier={selectedSupplier}
            onSave={saveSupplierEdit}
            onClose={() => setShowSupplierEdit(false)}
          />
        )}

        {showBlacklist && selectedSupplier && (
          <BlacklistModal
            supplier={selectedSupplier}
            onRestore={toggleBlacklist}
            onClose={() => setShowBlacklist(false)}
          />
        )}

        {showPackRules && selectedSupplier && (
          <PackRulesModal
            supplierName={selectedSupplier.name}
            rules={selectedSupplier.packRules || []}
            onAdd={addPackRule}
            onRemove={removePackRule}
            onReprocess={applyRulesRetroactively}
            onClose={() => setShowPackRules(false)}
          />
        )}

        {viewingBatch && selectedSupplier && (
          <QuoteDetailModal
            batch={viewingBatch}
            supplierId={activeTab!}
            supplier={selectedSupplier}
            setSuppliers={setSuppliers}
            onClose={() => setViewingBatch(null)}
            onBatchCompleted={onBatchCompleted}
            onBatchDateChange={onBatchDateChange}
            onBanItem={toggleBlacklist}
            productMappings={productMappings}
            masterProducts={masterProducts}
            onAddMapping={onAddMapping}
            onRemoveMapping={onRemoveMapping}
            globalPackRules={globalPackRules}
          />
        )}

        {/* ── Sidebar ── */}
        <div className="md:col-span-1 bg-slate-800 rounded-lg p-4 flex flex-col gap-4 border border-slate-700 h-full overflow-hidden">
          <h2 className="text-xl font-bold text-amber-500 flex items-center gap-2 flex-shrink-0">
            <CheckCircle className="w-5 h-5" /> Fornecedores
          </h2>
          <div className="flex gap-2 flex-shrink-0">
            <input
              type="text"
              placeholder="Novo Fornecedor..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSupplier()}
            />
            <button onClick={addSupplier} className="bg-amber-600 hover:bg-amber-700 text-white p-2 rounded">
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {suppliers.map(s => (
              <div
                key={s.id}
                onClick={() => setActiveTab(s.id)}
                className={`p-3 rounded cursor-pointer border transition-all ${activeTab === s.id ? 'bg-slate-700 border-amber-500/50 shadow-md' : 'bg-slate-900 border-transparent hover:border-slate-600'} flex justify-between items-center group`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className={`w-2 h-2 flex-shrink-0 rounded-full ${s.isEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className={`truncate text-sm ${!s.isEnabled && 'text-slate-500 line-through'}`}>{s.name}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSupplier(s.id); }}
                  title={s.isEnabled ? 'Desabilitar' : 'Habilitar'}
                  className="text-slate-400 hover:text-white opacity-60 group-hover:opacity-100 p-1"
                >
                  {s.isEnabled ? <Eye className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Main Panel ── */}
        <div className="md:col-span-3 bg-slate-800 rounded-lg p-6 border border-slate-700 overflow-y-auto h-full relative">
          {selectedSupplier ? (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex justify-between items-center border-b border-slate-700 pb-4 sticky top-0 bg-slate-800 z-10">
                <div className="flex-1">
                  {/* Linha principal: nome + ações primárias */}
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-white">{selectedSupplier.name}</h2>
                    <button
                      onClick={() => setShowSupplierEdit(true)}
                      className="text-slate-500 hover:text-amber-400 p-1.5 rounded-lg hover:bg-amber-900/20 transition-all"
                      title="Editar fornecedor"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {!selectedSupplier.isEnabled && (
                      <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full border border-red-900">Desabilitado</span>
                    )}
                  </div>
                  {/* Sub-row: tags de contexto (colapsáveis visualmente) */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {selectedSupplier.whatsapp && (
                      <span className="text-[10px] bg-green-900/20 text-green-500 border border-green-900/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <MessageCircle className="w-2.5 h-2.5" /> WA
                      </span>
                    )}
                    {selectedSupplier.address && (
                      <span className="text-[10px] bg-blue-900/20 text-blue-500 border border-blue-900/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" /> Maps
                      </span>
                    )}
                    {selectedSupplier.deliveryType && (
                      <span className="text-[10px] text-slate-500 border border-slate-700/60 px-1.5 py-0.5 rounded">
                        {selectedSupplier.deliveryType === 'pickup' ? '🏪 Retirada' : selectedSupplier.deliveryType === 'delivery' ? '🚚 Entrega' : '↕️ Ambos'}
                      </span>
                    )}
                    {selectedSupplier.orderDays && (
                      <span className="text-[10px] text-slate-600">Pedidos: {selectedSupplier.orderDays}{selectedSupplier.deliveryDays ? ` · Entrega: ${selectedSupplier.deliveryDays}` : ''}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPackRules(true)}
                    className="text-slate-400 hover:text-white p-2 rounded hover:bg-slate-700/50 transition-colors flex items-center gap-2 text-xs border border-slate-700"
                    title="Exceções de lote para este fornecedor"
                  >
                    <Settings className="w-4 h-4 text-blue-500" /> Exceções de Lote
                  </button>
                  <div className="w-px h-6 bg-slate-700 mx-1" />
                  <button
                    onClick={() => setShowBlacklist(true)}
                    className="text-slate-400 hover:text-white p-2 rounded hover:bg-slate-700/50 transition-colors flex items-center gap-2 text-xs border border-slate-700"
                  >
                    <Ban className="w-4 h-4 text-red-500" /> Lista Negra ({selectedSupplier.blacklist?.length || 0})
                  </button>
                  <div className="w-px h-6 bg-slate-700 mx-1" />
                  <button
                    onClick={() => deleteSupplier(selectedSupplier.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20 p-2 rounded transition-colors flex items-center gap-2 text-xs"
                  >
                    <Trash2 className="w-4 h-4" /> Excluir
                  </button>
                </div>
              </div>

              {/* Upload Zone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-all duration-300 ease-in-out relative group cursor-pointer overflow-hidden ${dragState !== 'idle' ? 'scale-[1.02] ring-2 ring-amber-500/50 bg-slate-800' : 'border-slate-600 hover:bg-slate-700/30'}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input type="file" accept="image/*, .txt, .csv, .pdf" multiple ref={fileInputRef} onChange={handleFilesSelected} className="hidden" />
                  <div className="pointer-events-none flex flex-col items-center justify-center w-full h-full">
                    {dragState === 'idle' && (
                      <>
                        <Upload className="w-8 h-8 text-amber-500 mb-2 transition-transform group-hover:scale-110" />
                        <p className="text-sm font-medium">Upload de Arquivo(s)</p>
                        <p className="text-[10px] text-slate-500">Arraste múltiplos arquivos aqui</p>
                      </>
                    )}
                    {dragState === 'single' && <div className="animate-bounce"><FilePlus className="w-10 h-10 text-amber-400 mb-2" /><p className="text-amber-400 font-bold">Solte o arquivo aqui</p></div>}
                    {dragState === 'multiple' && <div className="animate-pulse"><Files className="w-10 h-10 text-green-400 mb-2" /><p className="text-green-400 font-bold">Solte os arquivos aqui</p></div>}
                  </div>
                  {(uploadQueue.length > 0 || isQueueProcessing) && (
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
                      <span className="bg-slate-900 px-2 py-1 rounded text-[10px] text-slate-300 flex items-center gap-1 border border-slate-700 shadow-lg">
                        <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                        Processando: {isQueueProcessing ? uploadQueue.length + 1 : uploadQueue.length} na fila
                      </span>
                    </div>
                  )}
                </div>

                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700 flex flex-col min-h-[140px]">
                  <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1"><FileText className="w-3 h-3" /> Lista WhatsApp / Texto</p>
                  <textarea
                    className="flex-1 bg-transparent resize-none focus:outline-none text-sm mb-2 placeholder-slate-600"
                    placeholder="Cole a lista do WhatsApp aqui..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                  />
                  <button
                    onClick={() => handleTextSubmit(selectedSupplier.id)}
                    disabled={!textInput.trim()}
                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs py-1 px-3 rounded self-end"
                  >
                    Processar Texto
                  </button>
                </div>
              </div>

              {/* ─── Divisor visual: Upload / Histórico ─── */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-slate-700/60" />
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest flex-shrink-0">Histórico de Cotações</span>
                <div className="flex-1 h-px bg-slate-700/60" />
              </div>

              {/* Quote History */}
              <div className="space-y-3 pb-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-300">Histórico de Cotações</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setQuoteSortMode('quoteDate')}
                        className={`px-2 py-0.5 text-[10px] rounded transition-colors ${quoteSortMode === 'quoteDate' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-white'}`}
                      >
                        Data cotação
                      </button>
                      <button
                        onClick={() => setQuoteSortMode('uploadDate')}
                        className={`px-2 py-0.5 text-[10px] rounded transition-colors ${quoteSortMode === 'uploadDate' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-white'}`}
                      >
                        Data upload
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {setPriceValidityConfig && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Archive className="w-3 h-3" />
                        <span>Arquivar após</span>
                        <input
                          type="number" min={7} max={730}
                          value={priceValidityConfig?.quoteArchiveDays ?? 90}
                          onChange={e => setPriceValidityConfig(prev => ({ ...prev, quoteArchiveDays: Math.max(7, Number(e.target.value)) }))}
                          className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white text-center focus:border-amber-500 focus:outline-none"
                        />
                        <span>dias</span>
                      </div>
                    )}
                    <div className="relative w-64">
                      <Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Buscar no histórico..."
                        value={historySearchTerm}
                        onChange={(e) => setHistorySearchTerm(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-md py-1.5 pl-9 pr-4 text-xs text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {selectedSupplier.quotes.length === 0 && (
                  <div className="text-center py-8 text-slate-500 bg-slate-800/50 rounded border border-dashed border-slate-700">
                    Nenhuma cotação registrada. Faça upload, cole texto ou use um link.
                  </div>
                )}
                {filteredQuotes.map(quote => (
                  <QuoteCard
                    key={quote.id}
                    quote={quote}
                    supplierId={selectedSupplier.id}
                    onViewRaw={handleViewRaw}
                    onDownloadCsv={handleDownloadCsv}
                    onRemove={handleRemoveQuote}
                    onOpen={handleOpenBatch}
                    onDownloadArchived={handleDownloadArchived}
                  />
                ))}
                {historySearchTerm && filteredQuotes.length === 0 && (
                  <div className="text-center text-slate-500 text-sm py-4">Nenhuma cotação encontrada para "{historySearchTerm}"</div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <p>Selecione ou crie um fornecedor para começar.</p>
            </div>
          )}
        </div>
      </div>

      {/* Raw Content Modal — rendered outside grid to allow full-screen z-index */}
      {viewingRawContent && (
        <RawContentModal
          content={viewingRawContent.content}
          fileName={viewingRawContent.fileName}
          onCopy={handleCopyRawContent}
          onDownload={handleDownloadRawContent}
          onImport={handleImportRawContent}
          onClose={() => setViewingRawContent(null)}
        />
      )}

      {/* Processing Toast */}
      {processingToast && (
        <div className="fixed bottom-6 right-6 z-[200] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 flex items-start gap-3 max-w-sm animate-in slide-in-from-right-4">
          <div className="flex-shrink-0 mt-0.5">
            {processingToast.log.source === 'nfe'
              ? <Package className="w-4 h-4 text-green-400" />
              : <Bot className="w-4 h-4 text-amber-400" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{processingToast.fileName}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {processingToast.log.totalParsed} itens
              {processingToast.log.rulesApplied > 0 && <> · <span className="text-blue-400">{processingToast.log.rulesApplied} lotes ajustados</span></>}
              {processingToast.log.dateDetected && <> · <span className="text-amber-400">data detectada</span></>}
              {processingToast.log.source === 'ai' && <> · <span className="text-slate-500">via IA</span></>}
              {processingToast.log.source === 'nfe' && <> · <span className="text-green-500">NF-e</span></>}
            </p>
          </div>
          <button onClick={() => setProcessingToast(null)} className="text-slate-600 hover:text-white flex-shrink-0">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
};

export default SupplierManager;
