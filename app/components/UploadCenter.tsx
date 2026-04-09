import React, { useState, useRef } from 'react';
import { Supplier, PackRule, QuoteBatch, CartItem } from '../types';
import UploadItem, { UploadedFileData } from './UploadItem';
import { useFileProcessor } from '../hooks/useFileProcessor';
import { UploadCloud, CheckSquare, Square, Trash2, Send, Plus } from 'lucide-react';

interface UploadCenterProps {
  suppliers: Supplier[];
  globalPackRules: PackRule[];
  onBatchCompleted?: (batch: QuoteBatch, supplierId: string) => void;
  onCreateOrder?: (items: CartItem[], supplierId: string) => void;
  onNavigateToOrders?: () => void;
}

const UploadCenter: React.FC<UploadCenterProps> = ({ suppliers, globalPackRules, onBatchCompleted, onCreateOrder, onNavigateToOrders }) => {
  const [files, setFiles] = useState<UploadedFileData[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processedBatches, setProcessedBatches] = useState<Record<string, { batch: QuoteBatch; supplierId: string }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { processFile } = useFileProcessor();

   const handleDragOver = (e: React.DragEvent) => {
       e.preventDefault(); e.stopPropagation(); setIsDragging(true);
   };
   const handleDragLeave = (e: React.DragEvent) => {
       e.preventDefault(); e.stopPropagation(); setIsDragging(false);
   };
   const handleDrop = (e: React.DragEvent) => {
       e.preventDefault(); e.stopPropagation(); setIsDragging(false);
       if (e.dataTransfer.files) handleAddFiles(Array.from(e.dataTransfer.files));
   };

   const handleAddFiles = (newFiles: File[]) => {
       const mapped = newFiles.map(f => ({
           id: crypto.randomUUID(),
           file: f,
           tags: [],
           status: 'pending' as const,
           isSelected: true // auto seleciona por padrão os novos
       }));
       setFiles(prev => [...prev, ...mapped]);
   };

   const updateFile = (id: string, partial: Partial<UploadedFileData>) => {
       setFiles(prev => prev.map(f => f.id === id ? { ...f, ...partial } : f));
   };

   const removeFile = (id: string) => {
       setFiles(prev => prev.filter(f => f.id !== id));
       setProcessedBatches(prev => { const n = { ...prev }; delete n[id]; return n; });
   };

   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
       if (e.target.files) handleAddFiles(Array.from(e.target.files));
       if (fileInputRef.current) fileInputRef.current.value = '';
   };

   const toggleAll = () => {
       const allSelected = files.length > 0 && files.every(f => f.isSelected);
       setFiles(prev => prev.map(f => ({ ...f, isSelected: !allSelected })));
   };

   const removeSelected = () => {
       setFiles(prev => prev.filter(f => !f.isSelected));
   };

   const processItem = async (id: string) => {
       const item = files.find(f => f.id === id);
       if (!item || !item.supplierId || item.tags.length === 0) {
           updateFile(id, { status: 'error', errorMessage: 'Fornecedor e Tag obrigatórios.' });
           return;
       }
       const supplier = suppliers.find(s => s.id === item.supplierId);

       updateFile(id, { status: 'processing', errorMessage: undefined });
       
       const _uploadedAt = Date.now();
       const result = await processFile(item.file, supplier, globalPackRules);
       
       if (result.errorMessage) {
           updateFile(id, { status: 'error', errorMessage: result.errorMessage });
       } else {
           const batch: QuoteBatch = {
               id: crypto.randomUUID(),
               timestamp: item.mappedDate || result.detectedDate || _uploadedAt,
               uploadedAt: _uploadedAt,
               sourceType: 'file',
               fileName: item.file.name + ` [${item.tags.join(',').toUpperCase()}]`,
               status: 'completed',
               items: result.quotes,
               ...(item.mappedDate || result.detectedDate ? { detectedDate: item.mappedDate || result.detectedDate } : {})
           };

           // Repassa o Batch Completo para a camada App
           onBatchCompleted?.(batch, item.supplierId);
           // Guarda batch localmente para o botão "Montar Pedido"
           setProcessedBatches(prev => ({ ...prev, [id]: { batch, supplierId: item.supplierId! } }));
           updateFile(id, { status: 'completed' });
       }
   };

   const processSelected = () => {
       const selectedIds = files.filter(f => f.isSelected && f.status !== 'completed').map(f => f.id);
       selectedIds.forEach(id => processItem(id));
   };

   const pendingCount = files.filter(f => f.status !== 'completed').length;
   const selectedCount = files.filter(f => f.isSelected).length;
   const completedCount = files.filter(f => f.status === 'completed').length;
   const allSelected = files.length > 0 && files.every(f => f.isSelected);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 p-6 overflow-y-auto w-full custom-scrollbar">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Central de Uploads</h1>
          <p className="text-slate-400">Arraste arquivos e gerencie suas notas, pedidos ou cotações.</p>
        </div>
        <button className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-lg flex items-center justify-center gap-2">
          <Plus className="w-5 h-5" />
          Novo Pedido Manual
        </button>
      </div>

      {/* Control Area Seção: Só mostra se houver filas */}
      {files.length > 0 && (
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6 shadow-sm gap-4">
            <div className="flex items-center gap-4">
                <button onClick={toggleAll} className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors" title={allSelected ? 'Desmarcar Tudo' : 'Selecionar Tudo'}>
                    {allSelected ? <CheckSquare className="w-5 h-5 text-amber-500" /> : <Square className="w-5 h-5 text-slate-500" />}
                    <span className="font-medium text-sm">Selecionar Tudo</span>
                </button>
                <div className="text-sm font-medium text-slate-500 border-l border-slate-700 pl-4 flex gap-2">
                   {selectedCount} selecionado(s)
                   {completedCount > 0 && <span className="text-green-500">| {completedCount} concluído(s)</span>}
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button 
                    onClick={removeSelected}
                    disabled={selectedCount === 0}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 rounded-lg transition-colors border border-slate-700 hover:border-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Trash2 className="w-4 h-4" /> Descartar
                </button>

                <button 
                    onClick={processSelected}
                    disabled={selectedCount === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Send className="w-4 h-4" /> Processar Selecionados
                </button>
            </div>
        </div>
      )}

      {/* Zona de Drop e Lista Intercalável */}
      <div 
         onDragOver={handleDragOver}
         onDragLeave={handleDragLeave}
         onDrop={handleDrop}
         className={`flex-1 rounded-2xl flex flex-col items-center border-2 transition-all p-6 mb-4
            ${files.length === 0 ? 'justify-center border-dashed p-10' : 'justify-start border-transparent p-0'}
            ${isDragging ? 'border-amber-500 bg-amber-900/10 shadow-[inset_0_0_20px_rgba(245,158,11,0.2)]' : 'border-slate-800'}
         `}
      >
        <input type="file" ref={fileInputRef} multiple className="hidden" onChange={handleFileSelect}/>

        {/* Placeholder gigante se vazio */}
        {files.length === 0 && (
            <div className="text-center flex flex-col items-center">
                <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mb-5 border border-slate-800 shadow-xl">
                    <UploadCloud className="w-10 h-10 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Arraste e solte seus arquivos aqui</h3>
                <p className="text-slate-400 mb-6 max-w-md">
                    Suporta arrastar múltiplos XMLs de Notas Fiscais, PDFs de Cotações ou Pedidos simultaneamente.
                </p>
                <button onClick={() => fileInputRef.current?.click()} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-medium transition-colors border border-slate-600 shadow-md">
                    Procurar Arquivos
                </button>
            </div>
        )}

        {/* Lista se não vazio */}
        {files.length > 0 && (
            <div className="w-full space-y-3">
                {files.map(item => (
                    <UploadItem
                        key={item.id}
                        item={item}
                        suppliers={suppliers}
                        onUpdate={updateFile}
                        onRemove={removeFile}
                        onProcess={processItem}
                        processedBatch={processedBatches[item.id]}
                        onCreateOrder={onCreateOrder ? (items, supplierId) => {
                          onCreateOrder(items, supplierId);
                          onNavigateToOrders?.();
                        } : undefined}
                    />
                ))}

                {/* Dropzone Miniatura no Fundo da Lista */}
                <div onClick={() => fileInputRef.current?.click()} className="mt-4 p-4 rounded-xl border-2 border-dashed border-slate-700 hover:border-slate-500 text-slate-500 bg-slate-900/50 hover:bg-slate-900 flex items-center justify-center gap-3 cursor-pointer transition-colors">
                    <UploadCloud className="w-5 h-5 text-amber-500" />
                    <span className="font-medium">Adicionar mais arquivos...</span>
                </div>
            </div>
        )}
      </div>

    </div>
  );
};

export default UploadCenter;
