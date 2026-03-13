import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Supplier, QuoteBatch, ProductQuote, PackRule, BusinessHours, BusinessDayHours } from '../types';
import { Upload, Trash2, FileText, CheckCircle, AlertCircle, Loader2, Plus, Ban, Eye, Package, Pencil, Save, X, Maximize2, XCircle, RefreshCw, HardDrive, Download, Coins, BoxSelect, Sparkles, ChevronLeft, ChevronRight, Wand2, ChevronDown, ChevronUp, AlertTriangle, Check, CheckSquare, Square, Undo2, Timer, Search, Files, FilePlus, Settings, Bot, FileStack, Scissors, MessageCircle, MapPin, Truck, Calendar, Clock, Phone, ArrowUpDown, SortAsc, SortDesc } from 'lucide-react';
import { parseQuoteContent, generateProductVariations, batchSmartIdentify, extractCatalogRawData, RawCatalogItem } from '../services/geminiService';
import { parseQuoteLocal } from '../services/parseQuoteLocal';
import { isNFeXml, parseNFeFile } from '../services/parseNFe';

// ─── Constantes de padrão ─────────────────────────────────────────────────────

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

interface SupplierManagerProps {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  globalPackRules: PackRule[];
  setGlobalPackRules: React.Dispatch<React.SetStateAction<PackRule[]>>;
  onBatchCompleted?: (batch: QuoteBatch, supplierId: string) => void;
}

const SupplierManager: React.FC<SupplierManagerProps> = ({ suppliers, setSuppliers, globalPackRules, setGlobalPackRules, onBatchCompleted }) => {
  const [newSupplierName, setNewSupplierName] = useState('');
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  
  // Modal de edição do fornecedor
  const [showSupplierEdit, setShowSupplierEdit] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingHoursDay, setEditingHoursDay] = useState<keyof BusinessHours | null>(null);

  // State for viewing details
  const [viewingBatch, setViewingBatch] = useState<QuoteBatch | null>(null);
  const [detailsSearchTerm, setDetailsSearchTerm] = useState('');
  const [detailsSortBy, setDetailsSortBy] = useState<'default' | 'name' | 'price_asc' | 'price_desc' | 'pack'>('default');

  // Edição de data da cotação
  const [editingBatchDate, setEditingBatchDate] = useState(false);
  const [tempBatchDate, setTempBatchDate] = useState('');

  // Snapshot para fechar sem salvar
  const [batchSnapshot, setBatchSnapshot] = useState<QuoteBatch | null>(null);

  // State for viewing blacklist
  const [showBlacklist, setShowBlacklist] = useState(false);
  const [blacklistSearchTerm, setBlacklistSearchTerm] = useState('');

  // State for Rules
  const [showPackRules, setShowPackRules] = useState(false);
  const [showGlobalRules, setShowGlobalRules] = useState(false);

  // Inputs for Pack Rules
  const [newRuleTerm, setNewRuleTerm] = useState('');
  const [newRuleQty, setNewRuleQty] = useState(1);

  // State for History Search
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  // State for Product Renaming/Suggestions inside Modal
  const [suggestionsMap, setSuggestionsMap] = useState<Record<string, string[]>>({});
  const [suggestionIndexMap, setSuggestionIndexMap] = useState<Record<string, number>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState<Set<string>>(new Set());
  const [editingItemId, setEditingItemId] = useState<number | null>(null); 
  const [tempItemName, setTempItemName] = useState('');

  // Batch Magic State
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({ pending: false, ready: false, reprocessed: false });

  // Selection State
  const [selectedPendingItems, setSelectedPendingItems] = useState<Set<number>>(new Set());

  // --- UPLOAD QUEUE & DRAG STATE ---
  const [uploadQueue, setUploadQueue] = useState<{file: File, supplierId: string}[]>([]);
  const [isQueueProcessing, setIsQueueProcessing] = useState(false);
  const [dragState, setDragState] = useState<'idle' | 'single' | 'multiple'>('idle');

  // --- PRE-PROCESSOR STATE (CSV CONVERTER) ---
  const [isPreProcessing, setIsPreProcessing] = useState(false);
  const [preProcessResult, setPreProcessResult] = useState<string>('');
  const preProcessInputRef = useRef<HTMLInputElement>(null);

  // --- ACTION UX STATES (BAN/DELETE) ---
  const [confirmAction, setConfirmAction] = useState<{
      type: 'ban' | 'delete';
      batchId: string;
      itemIndex: number;
      itemName: string;
  } | null>(null);
  
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const dontAskAgainRef = useRef(false); // Ref for immediate access

  // Animation State: keys are `${batchId}-${itemIndex}`
  const [animatingRows, setAnimatingRows] = useState<Record<string, 'ban' | 'delete'>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set initial active tab if exists
  useEffect(() => {
    if (!activeTab && suppliers.length > 0) {
        setActiveTab(suppliers[0].id);
    }
  }, [suppliers.length, activeTab]);

  // Reset selection/search when batch changes
  useEffect(() => {
      setSelectedPendingItems(new Set());
      setDetailsSearchTerm('');
  }, [viewingBatch?.id]);

  // --- PRE-PROCESSOR LOGIC (CSV CONVERTER) ---
  const handlePreProcess = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsPreProcessing(true);
      setPreProcessResult('');

      try {
          const reader = new FileReader();
          reader.onload = async () => {
              const base64 = (reader.result as string).split(',')[1];
              const mimeType = file.type;

              // 1. Raw Extraction via AI
              const rawItems: RawCatalogItem[] = await extractCatalogRawData(base64, mimeType);

              // 2. Logic: Real Unit Price & Grouping
              const processedMap = new Map<string, { baseName: string, packFactor: number, lotPrice: number, unitPrice: number, flavors: string[] }>();
              const ungroupedItems: string[] = [];

              rawItems.forEach(item => {
                  // Pricing Rule:
                  // Scenario A (Has Pack): Unit = Val1 / Factor
                  // Scenario B (No Pack): Unit = Val2
                  let realUnitPrice = 0;
                  let lotPrice = item.val1;
                  
                  if (item.packFactor > 1) {
                      realUnitPrice = item.val1 / item.packFactor;
                  } else {
                      realUnitPrice = item.val2;
                      // If no pack detected, assume Lot Price is also Val2 for consistency unless Val1 exists and is different (rare case handled by Val2 priority)
                  }

                  const key = `${item.baseName}_${realUnitPrice.toFixed(2)}`;

                  if (!processedMap.has(key)) {
                      processedMap.set(key, {
                          baseName: item.baseName,
                          packFactor: item.packFactor,
                          lotPrice: lotPrice,
                          unitPrice: realUnitPrice,
                          flavors: []
                      });
                  }
                  
                  const entry = processedMap.get(key)!;
                  if (item.flavor) {
                      entry.flavors.push(item.flavor);
                  } else {
                      // If no flavor, push a placeholder or just count it? 
                      // If it's a base product without flavor, we treat it as is.
                      entry.flavors.push('Original');
                  }
              });

              // 3. Formatting Output
              let outputLines: string[] = [];

              processedMap.forEach((data) => {
                  const uniqueFlavors = Array.from(new Set(data.flavors));
                  
                  // Grouping Rule: Trigger ONLY if >= 3 variations
                  if (uniqueFlavors.length >= 3) {
                      const header = `${data.baseName} SABORES [${uniqueFlavors.length}]; R$${data.lotPrice.toFixed(2).replace('.', ',')}; R$${data.unitPrice.toFixed(2).replace('.', ',')}; LOTE ${data.packFactor}`;
                      const details = `sabores: ${uniqueFlavors.join('; ')}`;
                      outputLines.push(header);
                      outputLines.push(details);
                  } else {
                      // List individually if less than 3
                      // We need to retrieve original items or reconstruct. 
                      // Reconstruction from aggregated data for < 3:
                      uniqueFlavors.forEach(flav => {
                          const fullName = flav === 'Original' ? data.baseName : `${data.baseName} ${flav}`;
                          const line = `${fullName}; R$${data.lotPrice.toFixed(2).replace('.', ',')}; R$${data.unitPrice.toFixed(2).replace('.', ',')}; LOTE ${data.packFactor}`;
                          outputLines.push(line);
                      });
                  }
              });

              setPreProcessResult(outputLines.join('\n'));
              setIsPreProcessing(false);
          };
          reader.readAsDataURL(file);
      } catch (error) {
          console.error(error);
          setPreProcessResult("Erro ao processar arquivo.");
          setIsPreProcessing(false);
      }
      
      if (preProcessInputRef.current) preProcessInputRef.current.value = '';
  };

  const downloadPreProcessCsv = () => {
      if (!preProcessResult) return;
      const blob = new Blob([preProcessResult], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "catalogo_processado.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // --- NAMING RULES LOGIC (SEO STANDARDIZATION) ---
  // --- PACK RULES LOGIC ---
  const applyRulesToQuotes = (quotes: ProductQuote[], supplierExceptions: PackRule[], globalRules: PackRule[]): ProductQuote[] => {
      return quotes.map(quote => {
          const lowerName = quote.name.toLowerCase();
          
          // 1. Check Supplier Exceptions (Pack Rules) — prioridade sobre global
          const exception = supplierExceptions?.find(r => lowerName.includes(r.term.toLowerCase()));
          if (exception) return applyRule(quote, exception);

          // 2. Check Global Rules (Pack Rules)
          const globalRule = globalRules?.find(r => lowerName.includes(r.term.toLowerCase()));
          if (globalRule) return applyRule(quote, globalRule);

          return quote;
      });
  };

  const applyRule = (quote: ProductQuote, rule: PackRule): ProductQuote => {
      // Logic constraint: If item already has packQuantity > 1 from the parser (Evident Pack),
      // we do NOT override it with the rule, unless it's 1.
      if (quote.packQuantity > 1) {
          return { ...quote, isReprocessed: true };
      }

      const newQty = rule.quantity;
      const unitPrice = quote.priceStrategy === 'unit' ? quote.price : quote.price / newQty;
      return {
          ...quote,
          packQuantity: newQty,
          unitPrice: unitPrice,
          isVerified: false, // Keep verified false so it doesn't jump to Green immediately
          isReprocessed: true // Mark as reprocessed for the Yellow/Blue list
      };
  };

  // --- QUEUE PROCESSOR ---
  useEffect(() => {
      const processNext = async () => {
          if (uploadQueue.length === 0 || isQueueProcessing) return;

          setIsQueueProcessing(true);
          const currentTask = uploadQueue[0];
          const { file, supplierId } = currentTask;

          // Find current supplier rules (exceptions)
          const currentSupplier = suppliers.find(s => s.id === supplierId);
          const supplierExceptions = currentSupplier?.packRules || [];

          try {
              const reader = new FileReader();
              reader.onload = async () => {
                  const base64 = (reader.result as string).split(',')[1];
                  const mimeType = file.type;
                  
                  const newBatch: QuoteBatch = {
                      id: crypto.randomUUID(),
                      timestamp: Date.now(), // Ensure unique timestamp ordering
                      sourceType: 'file',
                      fileName: file.name,
                      status: 'analyzing',
                      items: []
                  };

                  updateSupplierQuotes(supplierId, newBatch);

                  try {
                      let quotes: ProductQuote[] = [];
                      let detectedDate: number | undefined = undefined;

                      // ── XML NF-e: parser local, sem IA ──────────────────
                      if (isNFeXml(file)) {
                          const nfeResult = await parseNFeFile(file);
                          if (nfeResult.errorMessage && nfeResult.items.length === 0) {
                              updateSupplierQuotes(supplierId, {
                                  ...newBatch,
                                  status: 'error',
                                  errorMessage: nfeResult.errorMessage
                              });
                              setUploadQueue(prev => prev.slice(1));
                              setIsQueueProcessing(false);
                              return;
                          }
                          quotes = nfeResult.items;
                          detectedDate = nfeResult.detectedDate;
                          // NF-e já vem com isVerified=true — não precisa de pack rules
                      } else {
                          // ── Outros formatos: IA Gemini ───────────────────
                          quotes = await parseQuoteContent(base64, mimeType, true);
                          quotes = filterBlacklisted(quotes, supplierId);
                          quotes = applyRulesToQuotes(quotes, supplierExceptions, globalPackRules);
                      }

                      const initializedQuotes = quotes.map(q => recalculateItem({...q, priceStrategy: q.priceStrategy ?? 'pack'}, q.priceStrategy ?? 'pack'));
                      const completedBatch: QuoteBatch = {
                          ...newBatch,
                          status: 'completed',
                          items: initializedQuotes,
                          ...(detectedDate ? { detectedDate, timestamp: detectedDate } : {}),
                      };
                      updateSupplierQuotes(supplierId, completedBatch);
                      onBatchCompleted?.(completedBatch, supplierId);
                  } catch (error) {
                      console.error(error);
                      updateSupplierQuotes(supplierId, { ...newBatch, status: 'error', errorMessage: 'Falha na análise IA.' });
                  }
                  
                  // Finished processing this file, remove from queue
                  setUploadQueue(prev => prev.slice(1));
                  setIsQueueProcessing(false);
              };
              reader.readAsDataURL(file);
          } catch (e) {
              console.error("Queue Error", e);
              setUploadQueue(prev => prev.slice(1));
              setIsQueueProcessing(false);
          }
      };

      processNext();
  }, [uploadQueue, isQueueProcessing, suppliers, globalPackRules]);


  const addSupplier = () => {
    if (!newSupplierName.trim()) return;
    const newSupplier: Supplier = {
      id: crypto.randomUUID(),
      name: newSupplierName,
      isEnabled: true,
      quotes: [],
      blacklist: [],
      packRules: []
    };
    setSuppliers([...suppliers, newSupplier]);
    setNewSupplierName('');
    setActiveTab(newSupplier.id);
  };

  const toggleSupplier = (id: string) => {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, isEnabled: !s.isEnabled } : s));
  };

  const deleteSupplier = (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este fornecedor e todo o histórico dele?')) {
      const remaining = suppliers.filter(s => s.id !== id);
      setSuppliers(remaining);
      
      // Update active tab safely
      if (activeTab === id) {
        setActiveTab(remaining.length > 0 ? remaining[0].id : null);
      }
    }
  };

  const downloadQuoteAsCsv = (batch: QuoteBatch) => {
      if (!batch.items || batch.items.length === 0) return;

      const header = "SKU;Produto;PrecoLista;Unidade;QtdEmbalagem;PrecoUnitarioCalculado\n";
      const rows = batch.items.map(item => {
          const listPrice = item.priceStrategy === 'unit' ? item.unitPrice : item.price;
          return `${item.sku};${item.name};"${listPrice.toFixed(2).replace('.', ',')}";${item.unit};${item.packQuantity};"${item.unitPrice.toFixed(2).replace('.', ',')}"`;
      }).join("\n");

      const csvContent = "data:text/csv;charset=utf-8," + encodeURI(header + rows);
      const link = document.createElement("a");
      link.setAttribute("href", csvContent);
      link.setAttribute("download", `Cotacao_${batch.fileName || 'Texto'}_${new Date(batch.timestamp).toLocaleDateString().replace(/\//g, '-')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // --- PACK RULES LOGIC ---
  const addPackRule = (supplierId: string | null) => {
      if (!newRuleTerm.trim() || newRuleQty < 1) return;
      
      const newRule: PackRule = {
          id: crypto.randomUUID(),
          term: newRuleTerm,
          quantity: newRuleQty
      };

      if (supplierId) {
          // Add Exception to Supplier
          setSuppliers(prev => prev.map(s => {
              if (s.id !== supplierId) return s;
              return { ...s, packRules: [...(s.packRules || []), newRule] };
          }));
      } else {
          // Add Global Rule
          setGlobalPackRules(prev => [...prev, newRule]);
      }
      
      setNewRuleTerm('');
      setNewRuleQty(1);
  };

  const removePackRule = (supplierId: string | null, ruleId: string) => {
      if (supplierId) {
          setSuppliers(prev => prev.map(s => {
              if (s.id !== supplierId) return s;
              return { ...s, packRules: s.packRules?.filter(r => r.id !== ruleId) };
          }));
      } else {
          setGlobalPackRules(prev => prev.filter(r => r.id !== ruleId));
      }
  };

  // --- NAMING RULES REMOVIDAS (aposentadas) ---

  // --- SUPPLIER EDIT MODAL ---
  const openSupplierEdit = (supplier: Supplier) => {
    setEditingSupplier({ ...supplier });
    setShowSupplierEdit(true);
  };

  const saveSupplierEdit = () => {
    if (!editingSupplier) return;
    setSuppliers(prev => prev.map(s => s.id === editingSupplier.id ? { ...s, ...editingSupplier } : s));
    setShowSupplierEdit(false);
    setEditingSupplier(null);
  };

  // --- BATCH DATE EDITING ---
  const startEditingBatchDate = (batch: QuoteBatch) => {
    const d = new Date(batch.timestamp);
    // format for datetime-local input: "YYYY-MM-DDTHH:MM"
    const pad = (n: number) => n.toString().padStart(2, '0');
    const val = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setTempBatchDate(val);
    setEditingBatchDate(true);
  };

  const saveBatchDate = (supplierId: string, batchId: string) => {
    if (!tempBatchDate) return;
    const ts = new Date(tempBatchDate).getTime();
    setSuppliers(prev => prev.map(s => {
      if (s.id !== supplierId) return s;
      return { ...s, quotes: s.quotes.map(q => q.id === batchId ? { ...q, timestamp: ts } : q) };
    }));
    if (viewingBatch?.id === batchId) setViewingBatch(prev => prev ? { ...prev, timestamp: ts } : prev);
    setEditingBatchDate(false);
  };

  // --- SAVE BATCH (manual confirmation) ---
  const saveBatch = (supplierId: string, batchId: string) => {
    const now = Date.now();
    setSuppliers(prev => prev.map(s => {
      if (s.id !== supplierId) return s;
      return { ...s, quotes: s.quotes.map(q => q.id === batchId ? { ...q, isSaved: true, savedAt: now } : q) };
    }));
    if (viewingBatch?.id === batchId) setViewingBatch(prev => prev ? { ...prev, isSaved: true, savedAt: now } : prev);
    // Dispara onBatchCompleted para processar catálogo/histórico
    const supplier = suppliers.find(s => s.id === supplierId);
    const batch = supplier?.quotes.find(q => q.id === batchId);
    if (supplier && batch) onBatchCompleted?.({ ...batch, isSaved: true, savedAt: now }, supplierId);
  };

  // --- PACK RULES LEARNING (ao salvar cotação) ---
  const learnPackRulesFromBatch = (batch: QuoteBatch, supplierId: string, supplierName: string) => {
    const newGlobal: PackRule[] = [];
    const newExceptions: { rule: PackRule; supplierId: string }[] = [];

    batch.items.forEach(item => {
      if (item.packQuantity <= 1) return;
      const nameLower = item.name.toLowerCase();

      // Tenta encontrar um term já existente que cubra este produto
      const globalMatch = globalPackRules.find(r => nameLower.includes(r.term.toLowerCase()));
      const supplierMatch = suppliers.find(s => s.id === supplierId)?.packRules?.find(r => nameLower.includes(r.term.toLowerCase()));

      if (supplierMatch) return; // Já tem exceção para este fornecedor, não muda

      if (globalMatch) {
        // Existe regra global — se quantidade difere, cria exceção para este fornecedor
        if (globalMatch.quantity !== item.packQuantity) {
          // Verifica se exceção já existe
          const alreadyHasException = suppliers.find(s => s.id === supplierId)?.packRules?.some(r => nameLower.includes(r.term.toLowerCase()));
          if (!alreadyHasException) {
            newExceptions.push({
              supplierId,
              rule: {
                id: crypto.randomUUID(),
                term: globalMatch.term,
                quantity: item.packQuantity,
                supplierId,
                supplierName,
                isLearned: true,
                learnedAt: Date.now(),
              }
            });
          }
        }
        return; // Regra global cobre, sem divergência
      }

      // Não existe regra global — cria uma nova com o nome mais curto possível
      // Usa as últimas 2-3 palavras do nome como term (ex: "350ML LATA")
      const words = item.name.trim().split(/\s+/);
      const term = words.slice(-2).join(' ');
      const alreadyInNew = newGlobal.some(r => r.term.toLowerCase() === term.toLowerCase());
      if (!alreadyInNew && term.length > 3) {
        newGlobal.push({
          id: crypto.randomUUID(),
          term,
          quantity: item.packQuantity,
          isLearned: true,
          learnedAt: Date.now(),
        });
      }
    });

    if (newGlobal.length > 0) setGlobalPackRules(prev => [...prev, ...newGlobal]);
    if (newExceptions.length > 0) {
      setSuppliers(prev => prev.map(s => {
        const exceptions = newExceptions.filter(e => e.supplierId === s.id).map(e => e.rule);
        if (exceptions.length === 0) return s;
        return { ...s, packRules: [...(s.packRules || []), ...exceptions] };
      }));
    }
  };

  // --- CLOSE BATCH MODAL WITH UNSAVED CHECK ---
  const handleCloseBatchModal = (supplierId: string) => {
    if (!viewingBatch || !batchSnapshot) {
      setViewingBatch(null);
      setBatchSnapshot(null);
      return;
    }
    const hasChanges = JSON.stringify(viewingBatch.items) !== JSON.stringify(batchSnapshot.items)
      || viewingBatch.timestamp !== batchSnapshot.timestamp;
    if (hasChanges) {
      if (window.confirm('Você fez alterações não salvas. Descartar as mudanças?')) {
        // Restaurar snapshot
        setSuppliers(prev => prev.map(s => {
          if (s.id !== supplierId) return s;
          return { ...s, quotes: s.quotes.map(q => q.id === batchSnapshot.id ? batchSnapshot : q) };
        }));
        setViewingBatch(null);
        setBatchSnapshot(null);
      }
      // Se cancelar, permanece com o modal aberto
    } else {
      setViewingBatch(null);
      setBatchSnapshot(null);
    }
  };

  // Re-run rules on existing quotes
  const applyRulesRetroactively = (supplierId: string | null) => {
      if (supplierId) {
          // Apply to specific supplier (merge exception + global)
          const supplier = suppliers.find(s => s.id === supplierId);
          if (!supplier) return;
          if (!confirm("Isso aplicará as Exceções e Regras Globais em TODAS as cotações deste fornecedor. Continuar?")) return;

          setSuppliers(prev => prev.map(s => {
              if (s.id !== supplierId) return s;
              const updatedQuotes = s.quotes.map(q => {
                  const updatedItems = applyRulesToQuotes(q.items, s.packRules || [], globalPackRules);
                  return { ...q, items: updatedItems };
              });
              return { ...s, quotes: updatedQuotes };
          }));
      } else {
          // Apply Global Rules to ALL Suppliers
          if (!confirm("ATENÇÃO: Isso aplicará as regras GLOBAIS em TODOS os fornecedores. Exceções individuais serão mantidas. Continuar?")) return;
          
          setSuppliers(prev => prev.map(s => {
              const updatedQuotes = s.quotes.map(q => {
                  const updatedItems = applyRulesToQuotes(q.items, s.packRules || [], globalPackRules);
                  return { ...q, items: updatedItems };
              });
              return { ...s, quotes: updatedQuotes };
          }));
      }
      alert("Regras aplicadas com sucesso!");
  };

  // --- BLACKLIST LOGIC & RESTORE ---
  const toggleBlacklist = (itemName: string) => {
      if (!activeTab) return;
      
      const supplier = suppliers.find(s => s.id === activeTab);
      if (!supplier) return;

      const currentList = supplier.blacklist || [];
      const exists = currentList.includes(itemName);
      
      let newList;
      if (exists) {
          // RESTORE LOGIC
          newList = currentList.filter(n => n !== itemName);
          restoreItemToBatch(activeTab, itemName);
      } else {
          // BAN LOGIC
          newList = [...currentList, itemName];
      }
      
      setSuppliers(prev => prev.map(s => s.id === activeTab ? { ...s, blacklist: newList } : s));
  };

  const restoreItemToBatch = (supplierId: string, itemName: string) => {
      setSuppliers(prev => prev.map(s => {
          if (s.id !== supplierId) return s;

          // Find or create "RESTAURADOS" batch
          let restoreBatch = s.quotes.find(q => q.fileName === "♻️ ITENS RESTAURADOS");
          const otherQuotes = s.quotes.filter(q => q.fileName !== "♻️ ITENS RESTAURADOS");

          if (!restoreBatch) {
              restoreBatch = {
                  id: crypto.randomUUID(),
                  timestamp: Date.now(),
                  sourceType: 'text',
                  fileName: "♻️ ITENS RESTAURADOS",
                  status: 'completed',
                  items: []
              };
          } else {
              // Update timestamp to float to top
              restoreBatch = { ...restoreBatch, timestamp: Date.now() };
          }

          // Create dummy item
          const restoredItem: ProductQuote = {
              sku: 'REST-' + Date.now().toString().slice(-4),
              name: itemName,
              price: 0,
              unit: 'UN',
              packQuantity: 1,
              unitPrice: 0,
              priceStrategy: 'pack',
              isVerified: false // Needs review
          };

          const newItems = [restoredItem, ...restoreBatch.items];
          return {
              ...s,
              quotes: [ { ...restoreBatch, items: newItems }, ...otherQuotes ]
          };
      }));
  };

  // --- NEW ANIMATED ACTION LOGIC ---
  
  const handleRequestAction = (type: 'ban' | 'delete', batchId: string, itemIndex: number, itemName: string) => {
      if (dontAskAgainRef.current) {
          triggerRowAnimation(type, batchId, itemIndex, itemName);
      } else {
          setConfirmAction({ type, batchId, itemIndex, itemName });
          setDontAskAgain(false);
      }
  };

  const confirmPendingAction = () => {
      if (!confirmAction) return;

      if (dontAskAgain) {
          dontAskAgainRef.current = true;
      }
      
      triggerRowAnimation(confirmAction.type, confirmAction.batchId, confirmAction.itemIndex, confirmAction.itemName);
      setConfirmAction(null);
  };

  const triggerRowAnimation = (type: 'ban' | 'delete', batchId: string, itemIndex: number, itemName: string) => {
      const key = `${batchId}-${itemIndex}`;
      setAnimatingRows(prev => ({ ...prev, [key]: type }));

      setTimeout(() => {
          if (type === 'ban') {
              toggleBlacklist(itemName);
          }
          deleteItemFromBatch(batchId, itemIndex);
          setAnimatingRows(prev => {
              const next = { ...prev };
              delete next[key];
              return next;
          });
      }, 2000);
  };

  // --- ITEM MANAGEMENT LOGIC (Inside Modal) ---

  const deleteItemFromBatch = (batchId: string, itemIndex: number) => {
      if (!activeTab || !viewingBatch) return;

      setSuppliers(prev => prev.map(s => {
          if (s.id !== activeTab) return s;
          return {
              ...s,
              quotes: s.quotes.map(q => {
                  if (q.id !== batchId) return q;
                  const newItems = q.items.filter((_, idx) => idx !== itemIndex);
                  return { ...q, items: newItems };
              })
          };
      }));

      setViewingBatch(prev => {
          if (!prev || prev.id !== batchId) return prev;
          const newItems = prev.items.filter((_, idx) => idx !== itemIndex);
          return { ...prev, items: newItems };
      });
  };

  const startEditingItem = (index: number, currentName: string) => {
      setEditingItemId(index);
      setTempItemName(currentName);
      const key = `${viewingBatch?.id}-${index}`;
      if (suggestionsMap[key]) {
         cancelSuggestion(viewingBatch!.id, index);
      }
  };

  const saveItemName = (batchId: string, itemIndex: number, newName: string) => {
      if (!activeTab || !viewingBatch) return;

      const updatedItems = viewingBatch.items.map((item, idx) => {
          if (idx === itemIndex) return { ...item, name: newName };
          return item;
      });

      setViewingBatch(prev => prev ? { ...prev, items: updatedItems } : null);

      setSuppliers(prev => prev.map(s => {
          if (s.id !== activeTab) return s;
          return {
              ...s,
              quotes: s.quotes.map(q => {
                  if (q.id !== batchId) return q;
                  return { ...q, items: updatedItems };
              })
          };
      }));
      
      setEditingItemId(null);
  };

  const fetchSuggestions = async (batchId: string, itemIndex: number, currentName: string, forceRefresh = false) => {
      const key = `${batchId}-${itemIndex}`;
      if (suggestionsMap[key] && !forceRefresh) return;

      setLoadingSuggestions(prev => new Set(prev).add(key));

      try {
          const variations = await generateProductVariations(currentName);
          if (variations.length > 0) {
              setSuggestionsMap(prev => ({ ...prev, [key]: variations }));
              setSuggestionIndexMap(prev => ({ ...prev, [key]: 0 }));
          } else {
              if(!forceRefresh) alert("Não encontrei sugestões para este produto.");
          }
      } catch (e) {
          console.error(e);
      } finally {
          setLoadingSuggestions(prev => {
              const next = new Set(prev);
              next.delete(key);
              return next;
          });
      }
  };

  const cycleSuggestion = (batchId: string, itemIndex: number, direction: 'prev' | 'next') => {
      const key = `${batchId}-${itemIndex}`;
      const list = suggestionsMap[key] || [];
      if (list.length === 0) return;

      setSuggestionIndexMap(prev => {
          const current = prev[key] || 0;
          let nextIndex = direction === 'next' ? current + 1 : current - 1;
          if (nextIndex >= list.length) nextIndex = 0;
          if (nextIndex < 0) nextIndex = list.length - 1;
          return { ...prev, [key]: nextIndex };
      });
  };

  const applySuggestion = (batchId: string, itemIndex: number) => {
      const key = `${batchId}-${itemIndex}`;
      const list = suggestionsMap[key];
      const idx = suggestionIndexMap[key] || 0;
      
      if (list && list[idx]) {
          saveItemName(batchId, itemIndex, list[idx]);
          cancelSuggestion(batchId, itemIndex);
      }
  };

  const cancelSuggestion = (batchId: string, itemIndex: number) => {
      const key = `${batchId}-${itemIndex}`;
      const newSuggestions = {...suggestionsMap};
      delete newSuggestions[key];
      setSuggestionsMap(newSuggestions);
  };

  const toggleSelection = (index: number) => {
      setSelectedPendingItems(prev => {
          const newSet = new Set(prev);
          if (newSet.has(index)) newSet.delete(index);
          else newSet.add(index);
          return newSet;
      });
  };

  const toggleSelectAll = (allIndices: number[]) => {
      if (allIndices.every(i => selectedPendingItems.has(i))) {
          setSelectedPendingItems(new Set());
      } else {
          setSelectedPendingItems(new Set(allIndices));
      }
  };

  const handleBatchMagic = async (batchId: string, pendingItems: {item: ProductQuote, originalIndex: number}[]) => {
      if (!activeTab || !viewingBatch) return;

      const itemsToProcess = pendingItems.filter(pi => selectedPendingItems.has(pi.originalIndex));

      if (itemsToProcess.length === 0) {
          alert("Selecione pelo menos um item da lista para identificar.");
          return;
      }

      setIsBatchProcessing(true);
      const payload = itemsToProcess.map(pi => ({ index: pi.originalIndex, name: pi.item.name, price: pi.item.price }));

      try {
          const results = await batchSmartIdentify(payload);
          
          const newItems = [...viewingBatch.items];

          results.forEach(res => {
              if (newItems[res.index]) {
                  const oldItem = newItems[res.index];
                  const newQty = res.suggestedPackQty || oldItem.packQuantity;
                  
                  newItems[res.index] = {
                      ...oldItem,
                      name: res.suggestedName || oldItem.name,
                      packQuantity: newQty,
                      isVerified: newQty > 1,
                      isReprocessed: false, // AI verification clears reprocessed status
                      unitPrice: oldItem.priceStrategy === 'unit' 
                          ? oldItem.price 
                          : oldItem.price / newQty
                  };
              }
          });

          setViewingBatch(prev => prev ? { ...prev, items: newItems } : null);
          setSuppliers(prev => prev.map(s => {
              if (s.id !== activeTab) return s;
              return {
                  ...s,
                  quotes: s.quotes.map(q => {
                      if (q.id !== batchId) return q;
                      return { ...q, items: newItems };
                  })
              };
          }));

          setSelectedPendingItems(new Set());

      } catch (e) {
          console.error(e);
          alert("Erro na identificação em massa.");
      } finally {
          setIsBatchProcessing(false);
      }
  };

  const recalculateItem = (item: ProductQuote, newStrategy?: 'pack' | 'unit', newPackQty?: number): ProductQuote => {
      const strategy = newStrategy || item.priceStrategy || 'pack';
      const qty = newPackQty !== undefined ? newPackQty : item.packQuantity;

      let unitPrice = 0;
      if (strategy === 'unit') {
          unitPrice = item.price;
      } else {
          unitPrice = item.price / (qty || 1);
      }

      return {
          ...item,
          priceStrategy: strategy,
          packQuantity: qty,
          unitPrice: unitPrice,
          isVerified: qty > 1 ? true : item.isVerified
      };
  };

  const updateItemStrategy = (batchId: string, itemIndex: number, newStrategy: 'pack' | 'unit') => {
      if (!activeTab || !viewingBatch) return;

      const updatedItems = viewingBatch.items.map((item, idx) => {
          if (idx === itemIndex) {
              return recalculateItem(item, newStrategy, undefined);
          }
          return item;
      });

      setViewingBatch(prev => prev ? { ...prev, items: updatedItems } : null);
      updateGlobalItems(batchId, updatedItems);
  };
  
  const updateItemPackQuantity = (batchId: string, itemIndex: number, newQty: number) => {
      if (!activeTab || !viewingBatch) return;
      const safeQty = Math.max(1, newQty);

      const updatedItems = viewingBatch.items.map((item, idx) => {
          if (idx === itemIndex) {
              return recalculateItem(item, undefined, safeQty);
          }
          return item;
      });

      setViewingBatch(prev => prev ? { ...prev, items: updatedItems } : null);
      updateGlobalItems(batchId, updatedItems);
  };

  const updateItemPrice = (batchId: string, itemIndex: number, newPrice: number) => {
      if (!activeTab || !viewingBatch) return;
      const safePrice = Math.max(0, newPrice);
      const updatedItems = viewingBatch.items.map((item, idx) => {
          if (idx === itemIndex) {
              const unitPrice = item.priceStrategy === 'unit' ? safePrice : safePrice / Math.max(1, item.packQuantity);
              return { ...item, price: safePrice, unitPrice };
          }
          return item;
      });
      setViewingBatch(prev => prev ? { ...prev, items: updatedItems } : null);
      updateGlobalItems(batchId, updatedItems);
  };

  const toggleItemVerification = (batchId: string, itemIndex: number) => {
      if (!activeTab || !viewingBatch) return;
      
      const updatedItems = viewingBatch.items.map((item, idx) => {
          if (idx === itemIndex) {
              // If moving to verified, clear reprocessed flag
              return { 
                  ...item, 
                  isVerified: !item.isVerified,
                  isReprocessed: !item.isVerified ? false : item.isReprocessed 
              };
          }
          return item;
      });
      
      setViewingBatch(prev => prev ? { ...prev, items: updatedItems } : null);
      updateGlobalItems(batchId, updatedItems);
  };

  const updateBatchStrategy = (batchId: string, newStrategy: 'pack' | 'unit') => {
      if (!activeTab || !viewingBatch) return;

      const updatedItems = viewingBatch.items.map(item => recalculateItem(item, newStrategy, undefined));
      setViewingBatch(prev => prev ? { ...prev, items: updatedItems } : null);
      updateGlobalItems(batchId, updatedItems);
  };

  const updateGlobalItems = (batchId: string, newItems: ProductQuote[]) => {
      setSuppliers(prev => prev.map(s => {
          if (s.id !== activeTab) return s;
          return {
              ...s,
              quotes: s.quotes.map(q => {
                  if (q.id !== batchId) return q;
                  return { ...q, items: newItems };
              })
          };
      }));
  }

  const filterBlacklisted = (quotes: ProductQuote[], supplierId: string): ProductQuote[] => {
      const supplier = suppliers.find(s => s.id === supplierId);
      if (!supplier || !supplier.blacklist) return quotes;
      return quotes.filter(q => !supplier.blacklist!.includes(q.name));
  };

  // --- UPLOAD HANDLERS ---
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && activeTab) {
        const newFiles = Array.from(e.target.files).map(f => ({ file: f, supplierId: activeTab }));
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
      // Only reset if we are actually leaving the container, not entering a child
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setDragState('idle');
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragState('idle');
      if (e.dataTransfer.files && activeTab) {
          const newFiles = Array.from(e.dataTransfer.files).map(f => ({ file: f, supplierId: activeTab }));
          setUploadQueue(prev => [...prev, ...newFiles]);
      }
  };

  const handleTextSubmit = (supplierId: string) => {
    if (!textInput.trim()) return;
    
    const newBatch: QuoteBatch = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      sourceType: 'text',
      rawContent: textInput,
      status: 'analyzing',
      items: []
    };

    updateSupplierQuotes(supplierId, newBatch);
    setTextInput('');

    // Find rules
    const currentSupplier = suppliers.find(s => s.id === supplierId);
    const supplierExceptions = currentSupplier?.packRules || [];

    try {
      // Usa parser local — sem Gemini, offline, gratuito
      let quotes = parseQuoteLocal(textInput, globalPackRules, supplierExceptions);
      quotes = filterBlacklisted(quotes, supplierId);

      // Aplica regras de nomenclatura (naming rules continuam funcionando)
      quotes = applyRulesToQuotes(quotes, supplierExceptions, globalPackRules);

      const initializedQuotes = quotes.map(q => recalculateItem({...q, priceStrategy: 'pack'}, 'pack'));
      const completedBatch = { ...newBatch, status: 'completed' as const, items: initializedQuotes };
      updateSupplierQuotes(supplierId, completedBatch);
      onBatchCompleted?.(completedBatch, supplierId);
    } catch (error) {
      updateSupplierQuotes(supplierId, { ...newBatch, status: 'error', errorMessage: 'Falha ao processar texto.' });
    }
  };

  const updateSupplierQuotes = (supplierId: string, batch: QuoteBatch) => {
    setSuppliers(prev => prev.map(s => {
      if (s.id === supplierId) {
        const existingIdx = s.quotes.findIndex(q => q.id === batch.id);
        let newQuotes = [...s.quotes];
        if (existingIdx >= 0) {
          newQuotes[existingIdx] = batch;
        } else {
          newQuotes = [batch, ...newQuotes];
        }
        return { ...s, quotes: newQuotes };
      }
      return s;
    }));
  };

  const removeQuoteBatch = (supplierId: string, batchId: string) => {
    if(window.confirm("Deseja apagar esta cotação?")) {
        setSuppliers(prev => prev.map(s => {
            if(s.id === supplierId) {
                return {...s, quotes: s.quotes.filter(q => q.id !== batchId)}
            }
            return s;
        }));
    }
  }

  // --- RENDER HELPERS ---
  const renderItemRow = (item: ProductQuote, idx: number, batchId: string) => {
    const suggestKey = `${batchId}-${idx}`;
    const suggestions = suggestionsMap[suggestKey] || [];
    const currentSuggestIdx = suggestionIndexMap[suggestKey] || 0;
    const isLoadingSuggestions = loadingSuggestions.has(suggestKey);

    const totalLotPrice = item.priceStrategy === 'pack' ? item.price : item.price * item.packQuantity;

    // Only allow selection for Pending Items (not verified)
    const isVerified = item.isVerified;
    const isReprocessed = item.isReprocessed;
    const isSelected = selectedPendingItems.has(idx);

    // --- ANIMATION CHECK ---
    const rowAnimationType = animatingRows[`${batchId}-${idx}`];
    
    if (rowAnimationType) {
        return (
            <tr key={idx} className="relative h-16 overflow-hidden">
                <td colSpan={10} className="p-0 relative bg-slate-900 border-b border-slate-800">
                    <div 
                        className={`absolute inset-0 z-10 origin-left transition-transform duration-[2000ms] ease-linear ${rowAnimationType === 'ban' ? 'bg-red-950/40' : 'bg-slate-700/40'}`}
                        style={{ transform: 'scaleX(0)', animation: 'progressFill 2s linear forwards' }}
                    ></div>
                    <div className="absolute inset-0 flex items-center justify-center z-20 text-slate-300 font-medium animate-pulse gap-2">
                         {rowAnimationType === 'ban' ? <Ban className="w-4 h-4 text-red-500"/> : <Trash2 className="w-4 h-4"/>}
                         {rowAnimationType === 'ban' ? 'Bloqueando item...' : 'Excluindo item...'}
                    </div>
                </td>
            </tr>
        );
    }

    return (
        <tr key={idx} className={`group border-b border-slate-800/30 last:border-0 transition-colors ${isSelected ? 'bg-amber-900/20' : 'hover:bg-slate-800/40'}`}>
            {/* Checkbox + Auto */}
            <td className="px-2 py-1.5 text-center w-10">
                <div className="flex flex-col items-center gap-1">
                    {!isVerified && (
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(idx)}
                            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-amber-600 cursor-pointer"/>
                    )}
                    {isReprocessed && (
                        <span className="text-blue-400 cursor-help" title="Lote ajustado automaticamente por regra de embalagem">
                            <Bot className="w-3.5 h-3.5"/>
                        </span>
                    )}
                </div>
            </td>

            {/* Nome */}
            <td className="px-2 py-1.5">
                {editingItemId === idx ? (
                    <div className="flex items-center gap-1.5">
                        <input autoFocus value={tempItemName} onChange={(e) => setTempItemName(e.target.value)}
                            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm w-full focus:outline-none focus:border-amber-500"
                            onKeyDown={(e) => { if (e.key === 'Enter') saveItemName(batchId, idx, tempItemName); if (e.key === 'Escape') setEditingItemId(null); }}/>
                        <button onClick={() => saveItemName(batchId, idx, tempItemName)} className="text-green-500"><CheckCircle className="w-4 h-4"/></button>
                        <button onClick={() => setEditingItemId(null)} className="text-red-500"><X className="w-4 h-4"/></button>
                    </div>
                ) : (
                    <div>
                        {suggestions.length > 0 ? (
                            <div className="flex items-center gap-1.5 bg-amber-900/20 border border-amber-900/50 p-1 rounded">
                                <button onClick={() => cancelSuggestion(batchId, idx)} className="text-red-400 p-0.5"><X className="w-3 h-3"/></button>
                                <button onClick={() => cycleSuggestion(batchId, idx, 'prev')} className="text-amber-500"><ChevronLeft className="w-3.5 h-3.5"/></button>
                                <button onClick={() => applySuggestion(batchId, idx)} className="flex-1 text-center font-bold text-amber-400 hover:text-white text-xs px-1 rounded hover:bg-amber-600">
                                    {suggestions[currentSuggestIdx]}
                                </button>
                                <button onClick={() => cycleSuggestion(batchId, idx, 'next')} className="text-amber-500"><ChevronRight className="w-3.5 h-3.5"/></button>
                                <button onClick={() => fetchSuggestions(batchId, idx, item.name, true)} className="text-blue-400 p-0.5"><RefreshCw className="w-3 h-3"/></button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 group/edit">
                                <span className={`text-sm font-medium leading-tight ${!item.isVerified ? 'text-amber-100' : 'text-white'}`}>{item.name}</span>
                                <div className="opacity-0 group-hover/edit:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
                                    <button onClick={() => startEditingItem(idx, item.name)} className="text-slate-600 hover:text-blue-400 p-0.5 rounded" title="Editar nome"><Pencil className="w-3 h-3"/></button>
                                    <button onClick={() => fetchSuggestions(batchId, idx, item.name)} className="text-slate-600 hover:text-amber-400 p-0.5 rounded" disabled={isLoadingSuggestions} title="Sugerir com IA">
                                        {isLoadingSuggestions ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3"/>}
                                    </button>
                                </div>
                            </div>
                        )}
                        {item.sku && <span className="text-[10px] text-slate-700 block">{item.sku}</span>}
                    </div>
                )}
            </td>

            {/* Lote */}
            <td className="px-2 py-1.5 text-center w-16">
                <input type="number" min="1" value={item.packQuantity}
                    onChange={(e) => updateItemPackQuantity(batchId, idx, parseInt(e.target.value))}
                    className="w-14 bg-slate-800 border border-slate-700 rounded px-1 py-1 text-center text-sm font-bold text-white focus:border-amber-500 focus:outline-none"/>
            </td>

            {/* Estratégia */}
            <td className="px-2 py-1.5 text-center w-14">
                <div className="flex items-center justify-center gap-0.5 bg-slate-950/50 p-0.5 rounded border border-slate-800">
                    <button onClick={() => updateItemStrategy(batchId, idx, 'pack')}
                        className={`p-1 rounded transition-all ${(!item.priceStrategy || item.priceStrategy === 'pack') ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}
                        title="Preço é do lote/caixa"><BoxSelect className="w-3 h-3"/></button>
                    <button onClick={() => updateItemStrategy(batchId, idx, 'unit')}
                        className={`p-1 rounded transition-all ${item.priceStrategy === 'unit' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-white'}`}
                        title="Preço é por unidade"><Coins className="w-3 h-3"/></button>
                </div>
            </td>

            {/* Preço lote (editável) */}
            <td className="px-2 py-1.5 text-right w-24">
                <input type="number" min="0" step="0.01" value={item.price.toFixed(2)}
                    onChange={(e) => updateItemPrice(batchId, idx, parseFloat(e.target.value) || 0)}
                    className="w-20 bg-slate-800 border border-slate-700 rounded px-1 py-1 text-right text-sm text-slate-300 font-medium focus:border-amber-500 focus:outline-none"/>
            </td>

            {/* Preço unitário calculado */}
            <td className="px-2 py-1.5 text-right w-20">
                <span className="font-bold text-amber-400 text-sm">R$ {item.unitPrice.toFixed(2)}</span>
            </td>

            {/* Ações */}
            <td className="px-2 py-1.5 text-center w-20">
                <div className="flex items-center justify-center gap-0.5">
                    <button onClick={() => toggleItemVerification(batchId, idx)}
                        className={`p-1.5 rounded transition-colors ${item.isVerified ? 'text-green-500 hover:bg-green-900/20' : 'text-slate-600 hover:bg-slate-700 hover:text-green-400'}`}
                        title={item.isVerified ? "Desmarcar" : "Confirmar"}>
                        {item.isVerified ? <CheckCircle className="w-3.5 h-3.5"/> : <Check className="w-3.5 h-3.5"/>}
                    </button>
                    <button onClick={() => handleRequestAction('ban', batchId, idx, item.name)}
                        className="text-slate-700 hover:text-red-500 p-1.5 rounded hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-all"
                        title="Bloquear item"><Ban className="w-3.5 h-3.5"/></button>
                    <button onClick={() => handleRequestAction('delete', batchId, idx, item.name)}
                        className="text-slate-700 hover:text-red-500 p-1.5 rounded hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remover item"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
            </td>
        </tr>
    );
  };
  const selectedSupplier = suppliers.find(s => s.id === activeTab);

  const renderRulesModal = (isGlobal: boolean) => {
      const title = isGlobal ? "Regras de Embalagem GLOBAIS" : "Exceções de Embalagem (Deste Fornecedor)";
      const description = isGlobal 
        ? "Defina regras que se aplicam a TODOS os fornecedores (ex: Longneck = 24). Se um fornecedor vender diferente, crie uma exceção no painel dele."
        : "Defina exceções apenas para ESTE fornecedor. Estas regras sobrescrevem as regras globais.";
      
      const rules = isGlobal ? globalPackRules : (selectedSupplier?.packRules || []);
      const onAdd = () => addPackRule(isGlobal ? null : selectedSupplier!.id);
      const onRemove = (id: string) => removePackRule(isGlobal ? null : selectedSupplier!.id, id);
      const onClose = () => isGlobal ? setShowGlobalRules(false) : setShowPackRules(false);
      const onApply = () => applyRulesRetroactively(isGlobal ? null : selectedSupplier!.id);

      return (
           <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 w-full max-w-2xl rounded-xl border border-slate-700 flex flex-col shadow-2xl max-h-[80vh]">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-xl">
                      <h3 className="font-bold text-white flex items-center gap-2">
                          <Settings className={`w-5 h-5 ${isGlobal ? 'text-amber-500' : 'text-blue-500'}`}/> {title}
                      </h3>
                      <button onClick={onClose}><X className="w-6 h-6 text-slate-500 hover:text-white"/></button>
                  </div>
                  
                  <div className="p-4 bg-slate-900 space-y-4">
                      <p className="text-sm text-slate-400">
                          {description}
                      </p>

                      <div className="flex gap-2">
                          <input 
                              type="text" 
                              placeholder="Ex: Longneck, Lata 350ml, Pack..." 
                              value={newRuleTerm}
                              onChange={(e) => setNewRuleTerm(e.target.value)}
                              className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                          />
                          <input 
                              type="number" 
                              min="1"
                              placeholder="Qtd"
                              value={newRuleQty}
                              onChange={(e) => setNewRuleQty(parseInt(e.target.value))}
                              className="w-20 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none text-center"
                          />
                          <button 
                              onClick={onAdd}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold"
                          >
                              <Plus className="w-5 h-5"/>
                          </button>
                      </div>

                      <div className="border-t border-slate-800 pt-4 max-h-60 overflow-y-auto space-y-2">
                          {rules.length === 0 && (
                              <p className="text-center text-slate-600 italic">Nenhuma regra definida.</p>
                          )}
                          {rules.map(rule => (
                              <div key={rule.id} className="flex justify-between items-center bg-slate-800 p-2 rounded border border-slate-700">
                                  <div className="flex items-center gap-2">
                                      <span className="text-slate-300">Contém: <strong className="text-white">"{rule.term}"</strong></span>
                                      <span className="text-slate-500">→</span>
                                      <span className="text-blue-400 font-bold">Lote: {rule.quantity}</span>
                                  </div>
                                  <button onClick={() => onRemove(rule.id)} className="text-slate-500 hover:text-red-500">
                                      <Trash2 className="w-4 h-4"/>
                                  </button>
                              </div>
                          ))}
                      </div>

                      <div className="pt-4 border-t border-slate-800">
                           <button 
                                onClick={onApply}
                                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 flex items-center justify-center gap-2 text-sm"
                           >
                               <RefreshCw className="w-4 h-4"/> Re-processar Cotações
                           </button>
                      </div>
                  </div>
              </div>
           </div>
      );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full relative">
      <style>{`
          @keyframes progressFill {
            from { transform: scaleX(0); }
            to { transform: scaleX(1); }
          }
      `}</style>
      
      {/* CONFIRMATION POPUP (Small Bubble) */}
      {confirmAction && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center pointer-events-auto">
             <div className="absolute inset-0 bg-transparent" onClick={() => setConfirmAction(null)}></div>
             <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-4 w-72 transform transition-all animate-in fade-in zoom-in-95 relative z-10">
                 <h4 className="font-bold text-white mb-1">
                     {confirmAction.type === 'ban' ? 'Bloquear Item?' : 'Excluir Item?'}
                 </h4>
                 <p className="text-xs text-slate-400 mb-3 line-clamp-2">
                     {confirmAction.type === 'ban' 
                         ? `Isso irá adicionar "${confirmAction.itemName}" à lista negra.`
                         : `Isso removerá "${confirmAction.itemName}" desta cotação.`}
                 </p>
                 <div className="flex items-center gap-2 mb-3 cursor-pointer" onClick={() => setDontAskAgain(!dontAskAgain)}>
                     <div className={`w-3 h-3 border rounded flex items-center justify-center ${dontAskAgain ? 'bg-amber-500 border-amber-500' : 'border-slate-500'}`}>
                         {dontAskAgain && <Check className="w-2 h-2 text-slate-900"/>}
                     </div>
                     <span className="text-[10px] text-slate-400">Não perguntar novamente nesta sessão</span>
                 </div>
                 <div className="flex gap-2 justify-end">
                     <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 text-xs text-slate-300 hover:text-white">Cancelar</button>
                     <button onClick={confirmPendingAction} className={`px-3 py-1.5 text-xs text-white rounded font-medium shadow-md ${confirmAction.type === 'ban' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-600 hover:bg-slate-500'}`}>Confirmar</button>
                 </div>
             </div>
          </div>
      )}

      {/* Modals */}
      {showGlobalRules && renderRulesModal(true)}
      {showPackRules && selectedSupplier && renderRulesModal(false)}

      {/* Blacklist Modal */}
      {/* ── SUPPLIER EDIT MODAL ── */}
      {showSupplierEdit && editingSupplier && (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-xl rounded-2xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950 rounded-t-2xl">
              <h3 className="font-bold text-white flex items-center gap-2"><Settings className="w-4 h-4 text-amber-400"/> Editar Fornecedor</h3>
              <button onClick={() => setShowSupplierEdit(false)}><X className="w-5 h-5 text-slate-500 hover:text-white"/></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-5">

              {/* Básico */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Informações Básicas</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Nome</label>
                    <input value={editingSupplier.name} onChange={e => setEditingSupplier(p => p ? {...p, name: e.target.value} : p)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><Phone className="w-3 h-3"/> WhatsApp</label>
                    <input placeholder="44999998888" value={editingSupplier.whatsapp || ''} onChange={e => setEditingSupplier(p => p ? {...p, whatsapp: e.target.value} : p)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><MapPin className="w-3 h-3"/> Endereço (para Maps)</label>
                  <input placeholder="Rua das Flores, 123, Centro, Maringá-PR" value={editingSupplier.address || ''} onChange={e => setEditingSupplier(p => p ? {...p, address: e.target.value} : p)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                </div>
              </div>

              {/* Logística */}
              <div className="space-y-3 border-t border-slate-800 pt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Logística</p>
                <div>
                  <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><Truck className="w-3 h-3"/> Tipo de atendimento</label>
                  <div className="flex gap-2">
                    {(['pickup','delivery','both'] as const).map(t => (
                      <button key={t} onClick={() => setEditingSupplier(p => p ? {...p, deliveryType: t} : p)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border ${editingSupplier.deliveryType === t ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
                        {t === 'pickup' ? '🏪 Retirada' : t === 'delivery' ? '🚚 Entrega' : '↕️ Ambos'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><Calendar className="w-3 h-3"/> Frequência de pedido</label>
                    <select value={editingSupplier.orderFrequency || ''} onChange={e => setEditingSupplier(p => p ? {...p, orderFrequency: e.target.value as any} : p)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                      <option value="">Livre</option>
                      <option value="daily">Diário</option>
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quinzenal</option>
                      <option value="monthly">Mensal</option>
                      <option value="custom">A cada X dias</option>
                    </select>
                  </div>
                  {editingSupplier.orderFrequency === 'custom' && (
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">A cada quantos dias?</label>
                      <input type="number" min={1} value={editingSupplier.orderFrequencyDays || ''} onChange={e => setEditingSupplier(p => p ? {...p, orderFrequencyDays: Number(e.target.value)} : p)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                    </div>
                  )}
                  {(['weekly','biweekly'] as const).includes(editingSupplier.orderFrequency as any) && (
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Dia da semana</label>
                      <select value={editingSupplier.orderWeekDay ?? ''} onChange={e => setEditingSupplier(p => p ? {...p, orderWeekDay: Number(e.target.value)} : p)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                        {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((d,i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Dias de pedido (descrição)</label>
                    <input placeholder="toda quarta-feira" value={editingSupplier.orderDays || ''} onChange={e => setEditingSupplier(p => p ? {...p, orderDays: e.target.value} : p)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Dias de entrega (descrição)</label>
                    <input placeholder="toda quinta-feira / dia seguinte" value={editingSupplier.deliveryDays || ''} onChange={e => setEditingSupplier(p => p ? {...p, deliveryDays: e.target.value} : p)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                  </div>
                </div>

                {/* Entrega incerta */}
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditingSupplier(p => p ? {...p, deliveryUncertain: !p.deliveryUncertain} : p)}
                    className={`relative w-10 h-5 rounded-full transition-all ${editingSupplier.deliveryUncertain ? 'bg-amber-600' : 'bg-slate-700'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${editingSupplier.deliveryUncertain ? 'left-5' : 'left-0.5'}`}/>
                  </button>
                  <span className="text-xs text-slate-300">Entrega sem data garantida</span>
                </div>
                {editingSupplier.deliveryUncertain && (
                  <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-amber-800/40">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Mínimo (dias)</label>
                      <input type="number" min={1} value={editingSupplier.deliveryMinDays || ''} onChange={e => setEditingSupplier(p => p ? {...p, deliveryMinDays: Number(e.target.value)} : p)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Máximo (dias)</label>
                      <input type="number" min={1} value={editingSupplier.deliveryMaxDays || ''} onChange={e => setEditingSupplier(p => p ? {...p, deliveryMaxDays: Number(e.target.value)} : p)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                    </div>
                  </div>
                )}

                {/* Tempos */}
                {(editingSupplier.deliveryType === 'pickup' || editingSupplier.deliveryType === 'both') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Tempo de preparo (min)</label>
                      <input type="number" min={0} placeholder="ex: 240" value={editingSupplier.pickupReadyMinutes || ''} onChange={e => setEditingSupplier(p => p ? {...p, pickupReadyMinutes: Number(e.target.value)} : p)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Permanência média (min)</label>
                      <input type="number" min={0} placeholder="ex: 30" value={editingSupplier.pickupStayMinutes || ''} onChange={e => setEditingSupplier(p => p ? {...p, pickupStayMinutes: Number(e.target.value)} : p)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                    </div>
                  </div>
                )}
                {(editingSupplier.deliveryType === 'delivery' || editingSupplier.deliveryType === 'both') && (
                  <div>
                    <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Horário esperado de entrega</label>
                    <input type="time" value={editingSupplier.expectedDeliveryTime || ''} onChange={e => setEditingSupplier(p => p ? {...p, expectedDeliveryTime: e.target.value} : p)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                  </div>
                )}
              </div>

              {/* Horários de Funcionamento */}
              <div className="space-y-2 border-t border-slate-800 pt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Horário de Funcionamento</p>
                <div className="flex gap-1">
                  {DAY_LABELS.map(({ key, short }) => {
                    const day = (editingSupplier.openingHours ?? DEFAULT_BUSINESS_HOURS)[key];
                    const isEditing = editingHoursDay === key;
                    return (
                      <div key={key} className="flex-1 flex flex-col items-center gap-0.5">
                        {/* Toggle aberto/fechado */}
                        <button
                          onClick={() => {
                            const cur = editingSupplier.openingHours ?? { ...DEFAULT_BUSINESS_HOURS };
                            setEditingSupplier(p => p ? { ...p, openingHours: { ...cur, [key]: { ...cur[key], open: !cur[key].open } } } : p);
                          }}
                          className={`w-full text-[10px] font-bold rounded py-1 transition-all border ${day.open ? 'bg-amber-600/20 border-amber-600/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-600'}`}
                        >
                          {short}
                        </button>
                        {/* Horários — clique para editar */}
                        {day.open ? (
                          isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={day.hours}
                              placeholder="08:00-18:00"
                              onChange={e => {
                                const cur = editingSupplier.openingHours ?? { ...DEFAULT_BUSINESS_HOURS };
                                setEditingSupplier(p => p ? { ...p, openingHours: { ...cur, [key]: { ...cur[key], hours: e.target.value } } } : p);
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
                    onClick={() => setEditingSupplier(p => p ? { ...p, orderTemplate: DEFAULT_ORDER_TEMPLATE } : p)}
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-amber-400 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-800"
                    title="Resetar para o template padrão"
                  >
                    <RefreshCw className="w-2.5 h-2.5"/> Padrão
                  </button>
                </div>
                <p className="text-[11px] text-slate-600">Variáveis: <span className="text-slate-400">[DATA] [HORA] [ITENS] [TOTAL] [TIPO] [PREVISAO]</span></p>
                <textarea
                  rows={5}
                  value={editingSupplier.orderTemplate ?? DEFAULT_ORDER_TEMPLATE}
                  onChange={e => setEditingSupplier(p => p ? {...p, orderTemplate: e.target.value} : p)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 resize-none font-mono text-xs leading-relaxed"
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <button onClick={() => setShowSupplierEdit(false)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition-colors">Cancelar</button>
              <button onClick={saveSupplierEdit} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors flex items-center gap-2"><Save className="w-4 h-4"/> Salvar</button>
            </div>
          </div>
        </div>
      )}

      {showBlacklist && selectedSupplier && (
           <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 w-full max-w-3xl rounded-xl border border-slate-700 flex flex-col shadow-2xl max-h-[80vh]">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-xl">
                      <h3 className="font-bold text-white flex items-center gap-2"><Ban className="w-5 h-5 text-red-500"/> Lista Negra ({selectedSupplier.blacklist?.length || 0})</h3>
                      <button onClick={() => setShowBlacklist(false)}><X className="w-6 h-6 text-slate-500 hover:text-white"/></button>
                  </div>
                  <div className="p-4 border-b border-slate-800 bg-slate-900">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                            <input type="text" placeholder="Pesquisar itens bloqueados..." value={blacklistSearchTerm} onChange={(e) => setBlacklistSearchTerm(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-red-500 focus:outline-none"/>
                        </div>
                  </div>
                  <div className="p-4 overflow-y-auto space-y-2 bg-slate-900">
                      <p className="text-sm text-slate-400 mb-2">Itens abaixo são ignorados automaticamente ao importar cotações deste fornecedor.</p>
                      {(!selectedSupplier.blacklist || selectedSupplier.blacklist.length === 0) && <div className="text-center text-slate-500 py-8 italic border-2 border-dashed border-slate-800 rounded-lg">Nenhum item bloqueado.</div>}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {selectedSupplier.blacklist?.filter(item => item.toLowerCase().includes(blacklistSearchTerm.toLowerCase())).map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-slate-800 p-3 rounded border border-slate-700 hover:border-red-900/50 transition-colors">
                                  <span className="text-sm text-slate-300 truncate mr-2" title={item}>{item}</span>
                                  <button onClick={() => toggleBlacklist(item)} className="text-green-500 hover:text-white hover:bg-green-600 p-1.5 rounded transition-colors" title="Restaurar para lista de cotação"><Undo2 className="w-4 h-4"/></button>
                              </div>
                          ))}
                      </div>
                  </div>
                  <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end rounded-b-xl">
                      <button onClick={() => setShowBlacklist(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 border border-slate-700">Fechar</button>
                  </div>
              </div>
           </div>
      )}

      {/* Detail Modal */}
      {viewingBatch && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 w-full max-w-6xl max-h-[90vh] rounded-xl border border-slate-700 flex flex-col shadow-2xl">
                <div className="p-3 border-b border-slate-700 flex flex-col md:flex-row justify-between items-start bg-slate-800 rounded-t-xl shrink-0 gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-white">Detalhes da Cotação</h3>
                            {/* Contador verificados/total */}
                            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                                ✓ {viewingBatch.items.filter(i => i.isVerified).length}/{viewingBatch.items.length}
                            </span>
                            {viewingBatch.isSaved && <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded-full">✓ Salva</span>}
                        </div>
                        {/* Data editável */}
                        <div className="flex items-center gap-1.5 mt-1">
                            <p className="text-xs text-slate-500 truncate">
                                {viewingBatch.sourceType === 'file' ? viewingBatch.fileName : 'Texto Importado'}
                            </p>
                            <span className="text-slate-700">·</span>
                            {editingBatchDate ? (
                                <div className="flex items-center gap-1">
                                    <input type="datetime-local" value={tempBatchDate} onChange={e => setTempBatchDate(e.target.value)}
                                        className="bg-slate-700 border border-amber-500 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none"/>
                                    <button onClick={() => saveBatchDate(activeTab!, viewingBatch.id)} className="text-green-400 p-0.5"><Check className="w-3 h-3"/></button>
                                    <button onClick={() => setEditingBatchDate(false)} className="text-red-400 p-0.5"><X className="w-3 h-3"/></button>
                                </div>
                            ) : (
                                <button onClick={() => startEditingBatchDate(viewingBatch)} className="flex items-center gap-1 text-slate-400 hover:text-amber-400 transition-colors group/date">
                                    <span className="text-xs">{new Date(viewingBatch.timestamp).toLocaleString('pt-BR')}</span>
                                    <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/date:opacity-100 transition-opacity"/>
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {/* Ordenação */}
                        <select value={detailsSortBy} onChange={e => setDetailsSortBy(e.target.value as any)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500">
                            <option value="default">Ordem original</option>
                            <option value="name">Nome A→Z</option>
                            <option value="price_asc">Preço ↑</option>
                            <option value="price_desc">Preço ↓</option>
                            <option value="pack">Lote ↓</option>
                        </select>
                        {/* Estratégia em lote */}
                        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-700">
                            <button onClick={() => updateBatchStrategy(viewingBatch.id, 'pack')} className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-slate-700 text-blue-400 font-medium"><BoxSelect className="w-3 h-3"/> Lote</button>
                            <div className="w-px h-3 bg-slate-700"/>
                            <button onClick={() => updateBatchStrategy(viewingBatch.id, 'unit')} className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-slate-700 text-amber-400 font-medium"><Coins className="w-3 h-3"/> Unit.</button>
                        </div>
                        {/* Busca */}
                        <div className="relative">
                            <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-slate-500"/>
                            <input type="text" placeholder="Filtrar..." value={detailsSearchTerm} onChange={e => setDetailsSearchTerm(e.target.value)}
                                className="bg-slate-900 border border-slate-600 rounded py-1.5 pl-7 pr-3 text-xs text-white w-36 focus:border-amber-500 focus:outline-none focus:w-48 transition-all"/>
                        </div>
                        {/* Botão Salvar cotação */}
                        <div className="flex flex-col items-center">
                            <button onClick={() => { saveBatch(activeTab!, viewingBatch.id); learnPackRulesFromBatch(viewingBatch, activeTab!, selectedSupplier?.name || ''); }}
                                disabled={viewingBatch.isSaved}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewingBatch.isSaved ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-900/40 cursor-default' : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/30'}`}>
                                <Save className="w-3.5 h-3.5"/>
                                {viewingBatch.isSaved ? 'Salva' : 'Salvar cotação'}
                            </button>
                            {viewingBatch.savedAt && <span className="text-[10px] text-slate-600 mt-0.5">{new Date(viewingBatch.savedAt).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}</span>}
                        </div>
                        {/* Fechar com check de mudanças */}
                        <button onClick={() => handleCloseBatchModal(activeTab!)} className="text-slate-400 hover:text-white p-1.5"><XCircle className="w-6 h-6"/></button>
                    </div>
                </div>
                
                <div className="overflow-auto p-4 flex-1 space-y-6 bg-slate-900">
                    {(() => {
                        const filteredItems = viewingBatch.items.map((it, idx) => ({ item: it, originalIndex: idx }))
                            .filter(x => {
                                if (!detailsSearchTerm) return true;
                                const term = detailsSearchTerm.toLowerCase();
                                return x.item.name.toLowerCase().includes(term) || x.item.sku.toLowerCase().includes(term);
                            })
                            .sort((a, b) => {
                                switch (detailsSortBy) {
                                    case 'name': return a.item.name.localeCompare(b.item.name);
                                    case 'price_asc': return a.item.unitPrice - b.item.unitPrice;
                                    case 'price_desc': return b.item.unitPrice - a.item.unitPrice;
                                    case 'pack': return b.item.packQuantity - a.item.packQuantity;
                                    default: return 0;
                                }
                            });
                        
                        // Categorization Logic
                        // 1. Reprocessed: Not Verified AND Reprocessed flag is true
                        const reprocessed = filteredItems.filter(x => !x.item.isVerified && x.item.isReprocessed);
                        
                        // 2. Pending: Not Verified AND Reprocessed flag is false (or undefined)
                        const pending = filteredItems.filter(x => !x.item.isVerified && !x.item.isReprocessed);
                        
                        // 3. Ready: Verified
                        const ready = filteredItems.filter(x => x.item.isVerified);
                        
                        const allPendingIndices = pending.map(p => p.originalIndex);
                        const isAllSelected = allPendingIndices.length > 0 && allPendingIndices.every(i => selectedPendingItems.has(i));

                        return (
                            <>
                                {/* SECTION 1: REPROCESSED AUTOMATICALLY (BLUE/YELLOW) */}
                                <div className="border border-blue-900/30 bg-blue-950/5 rounded-lg overflow-hidden">
                                    <div className="p-3 bg-blue-950/20 border-b border-blue-900/30 flex justify-between items-center cursor-pointer hover:bg-blue-950/30 transition-colors" onClick={() => setCollapsedSections(prev => ({ ...prev, reprocessed: !prev.reprocessed }))}>
                                        <h4 className="font-bold text-blue-400 flex items-center gap-2"><Bot className="w-5 h-5"/> Reprocessados Automaticamente ({reprocessed.length})</h4>
                                        <div className="flex items-center gap-2">
                                            {collapsedSections.reprocessed ? <ChevronDown className="w-5 h-5 text-blue-500"/> : <ChevronUp className="w-5 h-5 text-blue-500"/>}
                                        </div>
                                    </div>
                                    {!collapsedSections.reprocessed && (reprocessed.length === 0 ? <div className="p-4 text-center text-slate-500 italic text-xs">Nenhum item reprocessado por regra.</div> : 
                                        <table className="w-full text-left text-sm text-slate-300">
                                            <thead className="bg-blue-950/20 text-blue-400 uppercase tracking-wider text-xs sticky top-0">
                                                <tr>
                                                    <th className="p-3 w-10"></th>
                                                    <th className="p-3">Produto Identificado</th>
                                                    <th className="p-3 text-center w-28">Emb. (Qtd)</th>
                                                    <th className="p-3 text-center">Interpretação</th>
                                                    <th className="p-3 text-right">Total Lote</th>
                                                    <th className="p-3 text-right w-32">Unitário</th>
                                                    <th className="p-3 text-center w-24">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-blue-900/10">{reprocessed.map(x => renderItemRow(x.item, x.originalIndex, viewingBatch.id))}</tbody>
                                        </table>
                                    )}
                                </div>

                                {/* SECTION 2: PENDING (AMBER) */}
                                <div className="border border-amber-900/30 bg-amber-950/5 rounded-lg overflow-hidden">
                                    <div className="p-3 bg-amber-950/20 border-b border-amber-900/30 flex justify-between items-center cursor-pointer hover:bg-amber-950/30 transition-colors" onClick={() => setCollapsedSections(prev => ({ ...prev, pending: !prev.pending }))}>
                                        <h4 className="font-bold text-amber-500 flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Itens Pendentes / Revisão ({pending.length})</h4>
                                        <div className="flex items-center gap-2">
                                            {pending.length > 0 && !collapsedSections.pending && (
                                                <button onClick={(e) => { e.stopPropagation(); handleBatchMagic(viewingBatch.id, pending); }} disabled={isBatchProcessing || selectedPendingItems.size === 0} className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold flex items-center gap-1 shadow-lg shadow-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed">
                                                    {isBatchProcessing ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3 fill-white"/>}
                                                    {isBatchProcessing ? 'Processando...' : `Identificar Selecionados (${selectedPendingItems.size}) com IA`}
                                                </button>
                                            )}
                                            {collapsedSections.pending ? <ChevronDown className="w-5 h-5 text-amber-500"/> : <ChevronUp className="w-5 h-5 text-amber-500"/>}
                                        </div>
                                    </div>
                                    {!collapsedSections.pending && (pending.length === 0 ? <div className="p-8 text-center text-slate-500 italic">Todos os itens identificados!</div> : 
                                        <table className="w-full text-left text-sm text-slate-300">
                                            <thead className="bg-amber-950/20 text-amber-600 uppercase tracking-wider text-xs sticky top-0">
                                                <tr>
                                                    <th className="p-3 text-center w-10"><button onClick={() => toggleSelectAll(allPendingIndices)}>{isAllSelected ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}</button></th>
                                                    <th className="p-3">Produto Identificado</th>
                                                    <th className="p-3 text-center w-28">Emb. (Qtd)</th>
                                                    <th className="p-3 text-center">Interpretação</th>
                                                    <th className="p-3 text-right">Total Lote</th>
                                                    <th className="p-3 text-right w-32">Unitário</th>
                                                    <th className="p-3 text-center w-24">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-amber-900/10">{pending.map(x => renderItemRow(x.item, x.originalIndex, viewingBatch.id))}</tbody>
                                        </table>
                                    )}
                                </div>

                                {/* SECTION 3: IDENTIFIED (GREEN) */}
                                <div className="border border-green-900/30 bg-green-950/5 rounded-lg overflow-hidden">
                                    <div className="p-3 bg-green-950/20 border-b border-green-900/30 flex justify-between items-center cursor-pointer hover:bg-green-950/30 transition-colors" onClick={() => setCollapsedSections(prev => ({ ...prev, ready: !prev.ready }))}>
                                        <h4 className="font-bold text-green-500 flex items-center gap-2"><CheckCircle className="w-5 h-5"/> Itens Identificados ({ready.length})</h4>
                                        <div className="flex items-center gap-2">{collapsedSections.ready ? <ChevronDown className="w-5 h-5 text-green-500"/> : <ChevronUp className="w-5 h-5 text-green-500"/>}</div>
                                    </div>
                                    {!collapsedSections.ready && (ready.length === 0 ? <div className="p-8 text-center text-slate-500 italic">Nenhum item identificado ainda.</div> : 
                                        <table className="w-full text-left text-sm text-slate-300">
                                            <thead className="bg-green-950/20 text-green-600 uppercase tracking-wider text-xs">
                                                <tr>
                                                    <th className="p-3 w-10"></th>
                                                    <th className="p-3">Produto Identificado</th>
                                                    <th className="p-3 text-center w-28">Emb. (Qtd)</th>
                                                    <th className="p-3 text-center">Interpretação</th>
                                                    <th className="p-3 text-right">Total Lote</th>
                                                    <th className="p-3 text-right w-32">Unitário</th>
                                                    <th className="p-3 text-center w-24">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-green-900/10">{ready.map(x => renderItemRow(x.item, x.originalIndex, viewingBatch.id))}</tbody>
                                        </table>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </div>
                <div className="p-4 border-t border-slate-700 bg-slate-800 rounded-b-xl flex justify-between items-center text-sm text-slate-400 shrink-0">
                    <span>{viewingBatch.items.length} itens · ✓ {viewingBatch.items.filter(i => i.isVerified).length} verificados</span>
                    <button onClick={() => handleCloseBatchModal(activeTab!)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">Fechar</button>
                </div>
            </div>
        </div>
      )}

      {/* Sidebar List */}
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

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {suppliers.map(s => (
            <div 
              key={s.id} 
              onClick={() => setActiveTab(s.id)}
              className={`p-3 rounded cursor-pointer border transition-all ${activeTab === s.id ? 'bg-slate-700 border-amber-500/50 shadow-md' : 'bg-slate-900 border-transparent hover:border-slate-600'} flex justify-between items-center group`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                 <div className={`w-2 h-2 flex-shrink-0 rounded-full ${s.isEnabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                 <span className={`truncate text-sm ${!s.isEnabled && 'text-slate-500 line-through'}`}>{s.name}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); toggleSupplier(s.id); }}
                title={s.isEnabled ? "Desabilitar (Não vou lá essa semana)" : "Habilitar"}
                className="text-slate-400 hover:text-white opacity-60 group-hover:opacity-100 p-1"
              >
                {s.isEnabled ? <Eye className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>

        {/* Global Pack Rules Button */}
        <div className="mt-auto pt-2 border-t border-slate-700 space-y-2">
            <button 
                onClick={() => setShowGlobalRules(true)}
                className="w-full flex items-center justify-center gap-2 p-2 bg-slate-900 border border-amber-900/50 rounded hover:bg-amber-950/30 text-amber-500 text-xs font-bold transition-all"
            >
                <Settings className="w-4 h-4" /> REGRAS DE LOTE (GLOBAL)
            </button>
        </div>
      </div>

      {/* Main Panel */}
      <div className="md:col-span-3 bg-slate-800 rounded-lg p-6 border border-slate-700 overflow-y-auto h-full relative">
        
        {/* NEW: Pre-Processor Module */}
        <div className="mb-8 bg-slate-900/50 rounded-lg border border-slate-700 p-4 border-dashed relative">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-300 font-bold flex items-center gap-2 text-sm uppercase">
                    <Scissors className="w-4 h-4 text-pink-500"/> Pré-Processador de Catálogo (PDF/Imagem)
                </h3>
                <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    Módulo Independente
                </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Input Area */}
                <div 
                    onClick={() => preProcessInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-600 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800 transition-colors h-40"
                >
                    <input type="file" ref={preProcessInputRef} onChange={handlePreProcess} className="hidden" accept="image/*, application/pdf" />
                    {isPreProcessing ? (
                        <div className="text-center">
                            <Loader2 className="w-8 h-8 text-pink-500 animate-spin mx-auto mb-2"/>
                            <p className="text-xs text-pink-400 font-bold">Analisando imagem e agrupando sabores...</p>
                        </div>
                    ) : (
                        <div className="text-center text-slate-400">
                            <FileStack className="w-8 h-8 mx-auto mb-2 opacity-50"/>
                            <p className="text-sm font-medium">Upload PDF ou Imagem</p>
                            <p className="text-[10px] text-slate-500 mt-1">Converte para CSV e agrupa sabores (min 3).</p>
                        </div>
                    )}
                </div>

                {/* Output Area */}
                <div className="flex flex-col h-40">
                    <textarea 
                        className="flex-1 bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono text-green-400 resize-none focus:outline-none custom-scrollbar mb-2"
                        placeholder="O resultado CSV aparecerá aqui..."
                        value={preProcessResult}
                        readOnly
                    ></textarea>
                    <button 
                        onClick={downloadPreProcessCsv}
                        disabled={!preProcessResult}
                        className="w-full bg-pink-600 hover:bg-pink-700 disabled:opacity-50 disabled:bg-slate-700 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-2"
                    >
                        <Download className="w-3 h-3"/> Baixar CSV Processado
                    </button>
                </div>
            </div>
        </div>

        {selectedSupplier ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-slate-700 pb-4 sticky top-0 bg-slate-800 z-10">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-white">{selectedSupplier.name}</h2>
                  <button onClick={() => openSupplierEdit(selectedSupplier)} className="text-slate-500 hover:text-amber-400 p-1.5 rounded-lg hover:bg-amber-900/20 transition-all" title="Editar fornecedor">
                    <Pencil className="w-4 h-4"/>
                  </button>
                  {!selectedSupplier.isEnabled && <span className="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded-full border border-red-900">Desabilitado</span>}
                  {/* Tags rápidas de info */}
                  {selectedSupplier.whatsapp && <span className="text-[10px] bg-green-900/30 text-green-400 border border-green-900/40 px-2 py-0.5 rounded-full flex items-center gap-1"><MessageCircle className="w-2.5 h-2.5"/> WA</span>}
                  {selectedSupplier.address && <span className="text-[10px] bg-blue-900/30 text-blue-400 border border-blue-900/40 px-2 py-0.5 rounded-full flex items-center gap-1"><MapPin className="w-2.5 h-2.5"/> Maps</span>}
                  {selectedSupplier.deliveryType && <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full">{selectedSupplier.deliveryType === 'pickup' ? '🏪 Retirada' : selectedSupplier.deliveryType === 'delivery' ? '🚚 Entrega' : '↕️ Ambos'}</span>}
                </div>
                {selectedSupplier.orderDays && <p className="text-slate-600 text-xs mt-1">Pedidos: {selectedSupplier.orderDays}{selectedSupplier.deliveryDays ? ` · Entrega: ${selectedSupplier.deliveryDays}` : ''}</p>}
              </div>
              
              <div className="flex items-center gap-2">
                 <button onClick={() => setShowPackRules(true)} className="text-slate-400 hover:text-white p-2 rounded hover:bg-slate-700/50 transition-colors flex items-center gap-2 text-xs border border-slate-700" title="Exceções de lote para este fornecedor">
                    <Settings className="w-4 h-4 text-blue-500"/> Exceções de Lote
                 </button>
                 <div className="w-px h-6 bg-slate-700 mx-1"></div>
                 <button onClick={() => setShowBlacklist(true)} className="text-slate-400 hover:text-white p-2 rounded hover:bg-slate-700/50 transition-colors flex items-center gap-2 text-xs border border-slate-700">
                    <Ban className="w-4 h-4 text-red-500"/> Lista Negra ({selectedSupplier.blacklist?.length || 0})
                 </button>
                 <div className="w-px h-6 bg-slate-700 mx-1"></div>
                 <button onClick={() => deleteSupplier(selectedSupplier.id)} className="text-red-400 hover:text-red-300 hover:bg-red-900/20 p-2 rounded transition-colors flex items-center gap-2 text-xs">
                    <Trash2 className="w-4 h-4"/> Excluir
                 </button>
              </div>
            </div>

            {/* Input Grid - 2 Columns (URL removida) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {/* 1. File Upload (Multiple + Queue + DnD) */}
               <div 
                  className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-all duration-300 ease-in-out relative group cursor-pointer overflow-hidden ${dragState !== 'idle' ? 'scale-[1.02] ring-2 ring-amber-500/50 bg-slate-800' : 'border-slate-600 hover:bg-slate-700/30'}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
               >
                  <input type="file" accept="image/*, .txt, .csv, .pdf" multiple ref={fileInputRef} onChange={handleFilesSelected} className="hidden" />
                  
                  {/* Wrapper to prevent drag events from firing on children */}
                  <div className="pointer-events-none flex flex-col items-center justify-center w-full h-full">
                      {dragState === 'idle' && (
                          <>
                            <Upload className="w-8 h-8 text-amber-500 mb-2 transition-transform group-hover:scale-110" />
                            <p className="text-sm font-medium">Upload de Arquivo(s)</p>
                            <p className="text-[10px] text-slate-500">Arraste múltiplos arquivos aqui</p>
                          </>
                      )}
                      {dragState === 'single' && <div className="animate-bounce"><FilePlus className="w-10 h-10 text-amber-400 mb-2"/><p className="text-amber-400 font-bold">Solte o arquivo aqui</p></div>}
                      {dragState === 'multiple' && <div className="animate-pulse"><Files className="w-10 h-10 text-green-400 mb-2"/><p className="text-green-400 font-bold">Solte os arquivos aqui</p></div>}
                  </div>

                  {/* Processing Queue Indicator */}
                  {(uploadQueue.length > 0 || isQueueProcessing) && (
                      <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
                          <span className="bg-slate-900 px-2 py-1 rounded text-[10px] text-slate-300 flex items-center gap-1 border border-slate-700 shadow-lg">
                              <Loader2 className="w-3 h-3 animate-spin text-amber-500"/> 
                              Processando: {isQueueProcessing ? uploadQueue.length + 1 : uploadQueue.length} na fila
                          </span>
                      </div>
                  )}
               </div>

               {/* 2. Text Paste — expandido (URL import removida) */}
               <div className="bg-slate-900 rounded-lg p-3 border border-slate-700 flex flex-col min-h-[140px]">
                  <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1"><FileText className="w-3 h-3"/> Lista WhatsApp / Texto</p>
                  <textarea 
                    className="flex-1 bg-transparent resize-none focus:outline-none text-sm mb-2 placeholder-slate-600"
                    placeholder="Cole a lista do WhatsApp aqui..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                  ></textarea>
                  <button 
                    onClick={() => handleTextSubmit(selectedSupplier.id)}
                    disabled={!textInput.trim()}
                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs py-1 px-3 rounded self-end"
                  >
                    Processar Texto
                  </button>
               </div>
            </div>

            <div className="space-y-3 pb-10">
               <div className="flex items-center justify-between">
                   <h3 className="font-semibold text-slate-300">Histórico de Cotações</h3>
                   
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
               
               {selectedSupplier.quotes.length === 0 && (
                 <div className="text-center py-8 text-slate-500 bg-slate-800/50 rounded border border-dashed border-slate-700">
                    Nenhuma cotação registrada. Faça upload, cole texto ou use um link.
                 </div>
               )}
               {selectedSupplier.quotes
                 .filter(q => {
                     if (!historySearchTerm) return true;
                     const term = historySearchTerm.toLowerCase();
                     const matchName = (q.fileName || 'Texto Colado').toLowerCase().includes(term);
                     const matchItem = q.items.some(i => i.name.toLowerCase().includes(term));
                     return matchName || matchItem;
                 })
                 .map((quote) => (
                 <div key={quote.id} className="bg-slate-900 border border-slate-700 rounded p-4 relative group hover:border-amber-500/30 transition-all">
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                        {quote.status === 'completed' && (
                            <button
                                onClick={() => downloadQuoteAsCsv(quote)}
                                className="text-slate-600 hover:text-blue-400 p-1"
                                title="Baixar CSV para re-uso"
                            >
                                <Download className="w-4 h-4"/>
                            </button>
                        )}
                        <button 
                            onClick={(e) => { e.stopPropagation(); removeQuoteBatch(selectedSupplier.id, quote.id); }}
                            className="text-slate-600 hover:text-red-400 p-1"
                            title="Apagar Cotação"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <div className="flex items-start gap-3">
                        <div className="mt-1">
                            {quote.status === 'analyzing' && <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />}
                            {quote.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
                            {quote.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-200">
                                    {quote.sourceType === 'file' ? `Arquivo: ${quote.fileName}` : 'Texto Colado'}
                                </span>
                                <span className="text-xs text-slate-500">
                                    {new Date(quote.timestamp).toLocaleString()}
                                </span>
                            </div>
                            
                            {quote.status === 'completed' && (
                                <div className="mt-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm text-slate-400">{quote.items.length} itens identificados.</p>
                                        <button 
                                            onClick={() => { setViewingBatch(quote); setBatchSnapshot(JSON.parse(JSON.stringify(quote))); }}
                                            className="text-xs flex items-center gap-1 text-amber-500 hover:text-amber-400 font-medium"
                                        >
                                            <Maximize2 className="w-3 h-3" /> Ver Lista Completa
                                        </button>
                                    </div>

                                    {/* Preview Limitada */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mt-2 opacity-80">
                                        {quote.items.slice(0, 4).map((item, idx) => (
                                            <div key={idx} className="bg-slate-800 px-2 py-1.5 rounded border border-slate-700 text-xs flex justify-between items-center">
                                                <span className="font-medium text-slate-300 truncate mr-2 flex-1">{item.name}</span>
                                                <div className="text-right whitespace-nowrap">
                                                    <span className="text-amber-500 font-bold block">R$ {item.unitPrice.toFixed(2)} un</span>
                                                </div>
                                            </div>
                                        ))}
                                        {quote.items.length > 4 && <span className="text-xs pt-1 text-slate-500 italic pl-1">...mais {quote.items.length - 4} itens (clique em ver lista)</span>}
                                    </div>
                                </div>
                            )}
                            {quote.status === 'error' && (
                                <p className="text-red-400 text-sm mt-1">{quote.errorMessage}</p>
                            )}
                        </div>
                    </div>
                 </div>
               ))}
               {historySearchTerm && selectedSupplier.quotes.filter(q => {
                     const term = historySearchTerm.toLowerCase();
                     const matchName = (q.fileName || 'Texto Colado').toLowerCase().includes(term);
                     const matchItem = q.items.some(i => i.name.toLowerCase().includes(term));
                     return matchName || matchItem;
                 }).length === 0 && (
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
  );
};

export default SupplierManager;
