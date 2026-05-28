import React, { useState, useEffect } from 'react';
import { Supplier, QuoteBatch, PackRule, ProductQuote } from '../types';
import { ProcessingLog } from './useFileProcessor';

interface UploadQueueItem {
  file: File;
  supplierId: string;
}

interface UseUploadQueueParams {
  activeTab: string | null;
  suppliers: Supplier[];
  globalPackRules: PackRule[];
  processFile: (
    file: File,
    supplier: Supplier | undefined,
    globalPackRules: PackRule[]
  ) => Promise<{ quotes: ProductQuote[]; detectedDate?: number; errorMessage?: string; processingLog?: ProcessingLog }>;
  onBatchCompleted?: (batch: QuoteBatch, supplierId: string) => void;
  onBatchUpdate: (supplierId: string, batch: QuoteBatch) => void;
  onProcessingLog?: (log: ProcessingLog, fileName: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export function useUploadQueue({
  activeTab,
  suppliers,
  globalPackRules,
  processFile,
  onBatchCompleted,
  onBatchUpdate,
  onProcessingLog,
  fileInputRef,
}: UseUploadQueueParams) {
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isQueueProcessing, setIsQueueProcessing] = useState(false);
  const [dragState, setDragState] = useState<'idle' | 'single' | 'multiple'>('idle');

  useEffect(() => {
    const processNext = async () => {
      if (uploadQueue.length === 0 || isQueueProcessing) return;

      setIsQueueProcessing(true);
      const { file, supplierId } = uploadQueue[0];
      const currentSupplier = suppliers.find(s => s.id === supplierId);

      const uploadedAt = Date.now();
      const newBatch: QuoteBatch = {
        id: crypto.randomUUID(),
        timestamp: uploadedAt,
        uploadedAt,
        sourceType: 'file',
        fileName: file.name,
        status: 'analyzing',
        items: []
      };

      onBatchUpdate(supplierId, newBatch);

      const result = await processFile(file, currentSupplier, globalPackRules);

      if (result.errorMessage) {
        onBatchUpdate(supplierId, { ...newBatch, status: 'error', errorMessage: result.errorMessage });
      } else {
        const completedBatch: QuoteBatch = {
          ...newBatch,
          status: 'completed',
          items: result.quotes,
          ...(result.detectedDate ? { detectedDate: result.detectedDate, timestamp: result.detectedDate } : {}),
        };
        onBatchUpdate(supplierId, completedBatch);
        onBatchCompleted?.(completedBatch, supplierId);
        if (result.processingLog) onProcessingLog?.(result.processingLog, file.name);
      }

      setUploadQueue(prev => prev.slice(1));
      setIsQueueProcessing(false);
    };

    processNext();
  }, [uploadQueue, isQueueProcessing, suppliers, globalPackRules, processFile]);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && activeTab) {
      const newFiles = Array.from(e.target.files).map(file => ({ file, supplierId: activeTab }));
      setUploadQueue(prev => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState(e.dataTransfer.items.length > 1 ? 'multiple' : 'single');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragState('idle');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState('idle');
    if (e.dataTransfer.files && activeTab) {
      const newFiles = Array.from(e.dataTransfer.files).map(file => ({ file, supplierId: activeTab }));
      setUploadQueue(prev => [...prev, ...newFiles]);
    }
  };

  return {
    uploadQueue,
    isQueueProcessing,
    dragState,
    handleFilesSelected,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
