
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Supplier, QuoteBatch, ProductQuote, PackRule, NamingRule } from '../types';
import { Upload, Trash2, FileText, CheckCircle, AlertCircle, Loader2, Plus, Ban, Eye, Package, Pencil, Save, X, Maximize2, XCircle, RefreshCw, HardDrive, Download, Link as LinkIcon, Cloud, Coins, BoxSelect, Sparkles, ChevronLeft, ChevronRight, Wand2, ChevronDown, ChevronUp, AlertTriangle, Check, CheckSquare, Square, Undo2, Timer, Search, Files, FilePlus, Settings, Globe, Bot, Type, FileStack, Scissors } from 'lucide-react';
import { parseQuoteContent, generateProductVariations, batchSmartIdentify, extractCatalogRawData, RawCatalogItem } from '../services/geminiService';
import { parseQuoteLocal } from '../services/parseQuoteLocal';

interface SupplierManagerProps {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  globalPackRules: PackRule[];
  setGlobalPackRules: React.Dispatch<React.SetStateAction<PackRule[]>>;
  globalNamingRules: NamingRule[];
  setGlobalNamingRules: React.Dispatch<React.SetStateAction<NamingRule[]>>;
  onBatchCompleted?: (batch: QuoteBatch, supplierId: string) => void;
}

const SupplierManager: React.FC<SupplierManagerProps> = ({ suppliers, setSuppliers, globalPackRules, setGlobalPackRules, globalNamingRules, setGlobalNamingRules, onBatchCompleted }) => {
  const [newSupplierName, setNewSupplierName] = useState('');
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  
  // States for renaming Supplier
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState('');

  // State for cloud import
  const [importUrl, setImportUrl] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);

  // State for viewing details
  const [viewingBatch, setViewingBatch] = useState<QuoteBatch | null>(null);
  const [detailsSearchTerm, setDetailsSearchTerm] = useState(''); // SEARCH INSIDE BATCH

  // State for viewing blacklist
  const [showBlacklist, setShowBlacklist] = useState(false);
  const [blacklistSearchTerm, setBlacklistSearchTerm] = useState(''); // SEARCH BLACKLIST

  // State for Rules
  const [showPackRules, setShowPackRules] = useState(false);
  const [showGlobalRules, setShowGlobalRules] = useState(false);
  const [showNamingRules, setShowNamingRules] = useState(false); // New Naming Rules

  // Inputs for Pack Rules
  const [newRuleTerm, setNewRuleTerm] = useState('');
  const [newRuleQty, setNewRuleQty] = useState(1);

  // Inputs for Naming Rules
  const [namingRuleTerms, setNamingRuleTerms] = useState(''); // "350ml, Cerveja"
  const [namingRuleCategory, setNamingRuleCategory] = useState(''); // "CERVEJA"
  const [namingRuleSuffix, setNamingRuleSuffix] = useState(''); // "LATA"

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
  const standardizeName = (originalName: string, rules: NamingRule[]) => {
      // Pre-clean: Uppercase + Remove spaces between number and unit (473 ml -> 473ML)
      // This ensures "473 ML" matches a rule looking for "473ML"
      let finalName = originalName.toUpperCase().replace(/(\d+)\s+(ML|L|KG|G)/g, '$1$2');
      
      let bestRule: NamingRule | null = null;
      let maxScore = 0;

      // Find the most specific rule (most matching terms)
      for (const rule of rules) {
          // Check if ALL terms in the rule exist in the product name
          if (rule.terms.every(t => finalName.includes(t.toUpperCase()))) {
              if (rule.terms.length > maxScore) {
                  maxScore = rule.terms.length;
                  bestRule = rule;
              }
          }
      }

      // If no rule matches, return original
      if (!bestRule) return originalName;

      // --- RECONSTRUCTION LOGIC ---
      let details = finalName;
      
      // 1. Remove the trigger terms from the name to isolate "Brand/Details"
      bestRule.terms.forEach(t => {
          details = details.replace(t.toUpperCase(), '');
      });
      
      // 2. Remove the forced category/suffix if they appear in the name (to avoid "Cerveja Cerveja")
      if (bestRule.category) details = details.replace(bestRule.category.toUpperCase(), '');
      if (bestRule.suffix) details = details.replace(bestRule.suffix.toUpperCase(), '');

      // 3. Clean up spaces
      details = details.replace(/\s+/g, ' ').trim();

      // 4. Extract Volume if it was part of the terms (e.g., 350ML) to place it correctly
      // We assume terms like "350ML" are the volume.
      const volumeTerm = bestRule.terms.find(t => /\d+(ML|L)/i.test(t)) || '';
      
      // 5. Construct Final Name: CATEGORY + VOLUME + DETAILS + SUFFIX
      const parts = [
          bestRule.category,
          volumeTerm,
          details,
          bestRule.suffix
      ].filter(Boolean); // Remove empty/undefined

      return parts.join(' ').toUpperCase().replace(/\s+/g, ' ').trim();
  };

  // --- PACK RULES LOGIC ---
  const applyRulesToQuotes = (quotes: ProductQuote[], supplierExceptions: PackRule[], globalRules: PackRule[], namingRules: NamingRule[]): ProductQuote[] => {
      return quotes.map(quote => {
          // 1. Apply Naming Rules FIRST (Standardize text)
          const standardizedName = standardizeName(quote.name, namingRules);
          
          let modifiedQuote = { ...quote, name: standardizedName };
          const lowerName = standardizedName.toLowerCase();
          
          // 2. Check Supplier Exceptions (Pack Rules)
          const exception = supplierExceptions?.find(r => lowerName.includes(r.term.toLowerCase()));
          if (exception) {
              return applyRule(modifiedQuote, exception);
          }

          // 3. Check Global Rules (Pack Rules)
          const globalRule = globalRules?.find(r => lowerName.includes(r.term.toLowerCase()));
          if (globalRule) {
              return applyRule(modifiedQuote, globalRule);
          }

          // If renamed but no pack rule matched, just return the renamed item
          if (standardizedName !== quote.name) {
              return { ...modifiedQuote, isReprocessed: true }; // Flag it because name changed
          }

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
                      let quotes = await parseQuoteContent(base64, mimeType, true);
                      quotes = filterBlacklisted(quotes, supplierId);
                      
                      // Apply Naming AND Pack Rules
                      quotes = applyRulesToQuotes(quotes, supplierExceptions, globalPackRules, globalNamingRules);

                      const initializedQuotes = quotes.map(q => recalculateItem({...q, priceStrategy: 'pack'}, 'pack'));
                      const completedBatch = { ...newBatch, status: 'completed' as const, items: initializedQuotes };
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
  }, [uploadQueue, isQueueProcessing, suppliers, globalPackRules, globalNamingRules]);


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

  const startRenaming = (supplier: Supplier) => {
      setEditingNameValue(supplier.name);
      setIsEditingName(true);
  };

  const saveRename = (id: string) => {
      if (editingNameValue.trim()) {
          setSuppliers(prev => prev.map(s => s.id === id ? { ...s, name: editingNameValue } : s));
      }
      setIsEditingName(false);
  };

  const cancelRename = () => {
      setIsEditingName(false);
      setEditingNameValue('');
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

  // --- NAMING RULES LOGIC ---
  const addNamingRule = () => {
      if (!namingRuleTerms.trim()) return;
      
      const newRule: NamingRule = {
          id: crypto.randomUUID(),
          terms: namingRuleTerms.split(',').map(t => t.trim()).filter(t => t.length > 0),
          category: namingRuleCategory.trim() || undefined,
          suffix: namingRuleSuffix.trim() || undefined
      };

      setGlobalNamingRules(prev => [...prev, newRule]);
      
      setNamingRuleTerms('');
      setNamingRuleCategory('');
      setNamingRuleSuffix('');
  };

  const removeNamingRule = (ruleId: string) => {
      setGlobalNamingRules(prev => prev.filter(r => r.id !== ruleId));
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
                  const updatedItems = applyRulesToQuotes(q.items, s.packRules || [], globalPackRules, globalNamingRules);
                  return { ...q, items: updatedItems };
              });
              return { ...s, quotes: updatedQuotes };
          }));
      } else {
          // Apply Global Rules to ALL Suppliers
          if (!confirm("ATENÇÃO: Isso aplicará as regras GLOBAIS em TODOS os fornecedores. Exceções individuais serão mantidas. Continuar?")) return;
          
          setSuppliers(prev => prev.map(s => {
              const updatedQuotes = s.quotes.map(q => {
                  const updatedItems = applyRulesToQuotes(q.items, s.packRules || [], globalPackRules, globalNamingRules);
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

  const handleUrlImport = async (supplierId: string) => {
    if (!importUrl.trim()) return;
    setIsImportingUrl(true);

    let targetUrl = importUrl;
    if (targetUrl.includes('drive.google.com')) {
        const idMatch = targetUrl.match(/[-\w]{25,}/);
        if (idMatch) targetUrl = `https://drive.google.com/uc?export=download&id=${idMatch[0]}`;
    }
    if (targetUrl.includes('dropbox.com') && targetUrl.includes('dl=0')) {
        targetUrl = targetUrl.replace('dl=0', 'dl=1');
    }

    const tempId = crypto.randomUUID();
    const newBatch: QuoteBatch = {
        id: tempId,
        timestamp: Date.now(),
        sourceType: 'file',
        fileName: 'Link da Nuvem',
        status: 'analyzing',
        items: []
    };
    updateSupplierQuotes(supplierId, newBatch);
    setImportUrl('');

    // Find rules
    const currentSupplier = suppliers.find(s => s.id === supplierId);
    const supplierExceptions = currentSupplier?.packRules || [];

    try {
        const res = await fetch(targetUrl);
        if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`);
        
        const blob = await res.blob();
        const mimeType = blob.type || 'text/plain';

        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = (reader.result as string).split(',')[1];
            try {
                let quotes = await parseQuoteContent(base64, mimeType, true);
                quotes = filterBlacklisted(quotes, supplierId);
                
                // Rules: Naming -> Exception -> Global
                quotes = applyRulesToQuotes(quotes, supplierExceptions, globalPackRules, globalNamingRules);

                const initializedQuotes = quotes.map(q => recalculateItem({...q, priceStrategy: 'pack'}, 'pack'));
                const completedBatch = { ...newBatch, status: 'completed' as const, items: initializedQuotes, fileName: `Nuvem (${quotes.length} itens)` };
                updateSupplierQuotes(supplierId, completedBatch);
                onBatchCompleted?.(completedBatch, supplierId);
            } catch (aiError) {
                updateSupplierQuotes(supplierId, { ...newBatch, status: 'error', errorMessage: 'Erro na análise IA.' });
            }
        };
        reader.readAsDataURL(blob);

    } catch (e) {
        console.error(e);
        updateSupplierQuotes(supplierId, { 
            ...newBatch, 
            status: 'error', 
            errorMessage: 'Bloqueio de segurança (CORS). Baixe o arquivo manualmente e use o botão de Upload.' 
        });
    } finally {
        setIsImportingUrl(false);
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
      quotes = applyRulesToQuotes(quotes, supplierExceptions, globalPackRules, globalNamingRules);

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
        <tr key={idx} className={`group border-b border-slate-800/50 last:border-0 transition-colors ${isSelected ? 'bg-amber-900/20' : 'hover:bg-slate-800/50'}`}>
            <td className="p-3 text-center">
                {!isVerified && (
                    <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(idx)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                )}
            </td>
            <td className="p-3">
                {/* NAME EDITING / SUGGESTION UI */}
                {editingItemId === idx ? (
                    <div className="flex items-center gap-2">
                        <input 
                            autoFocus
                            value={tempItemName}
                            onChange={(e) => setTempItemName(e.target.value)}
                            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white w-full focus:outline-none focus:border-amber-500"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') saveItemName(batchId, idx, tempItemName);
                                if (e.key === 'Escape') setEditingItemId(null);
                            }}
                        />
                        <button onClick={() => saveItemName(batchId, idx, tempItemName)} className="text-green-500 hover:text-green-400"><CheckCircle className="w-5 h-5"/></button>
                        <button onClick={() => setEditingItemId(null)} className="text-red-500 hover:text-red-400"><X className="w-5 h-5"/></button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {/* Suggestions Carousel */}
                        {suggestions.length > 0 ? (
                                <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-900/50 p-1 rounded animate-in fade-in slide-in-from-left-2">
                                <button onClick={() => cancelSuggestion(batchId, idx)} className="text-red-400 hover:bg-red-900/30 rounded p-0.5"><X className="w-3 h-3"/></button>
                                <button onClick={() => cycleSuggestion(batchId, idx, 'prev')} className="text-amber-500 hover:bg-amber-900/50 rounded"><ChevronLeft className="w-4 h-4"/></button>
                                <button 
                                    onClick={() => applySuggestion(batchId, idx)}
                                    className="flex-1 text-center font-bold text-amber-400 hover:text-white transition-colors text-xs py-1 px-2 rounded hover:bg-amber-600"
                                    title="Clique para aplicar este nome"
                                >
                                    {suggestions[currentSuggestIdx]}
                                </button>
                                <button onClick={() => cycleSuggestion(batchId, idx, 'next')} className="text-amber-500 hover:bg-amber-900/50 rounded"><ChevronRight className="w-4 h-4"/></button>
                                <button onClick={() => fetchSuggestions(batchId, idx, item.name, true)} className="text-blue-400 hover:bg-blue-900/30 rounded p-0.5"><RefreshCw className="w-3 h-3"/></button>
                                </div>
                        ) : (
                            <div className="font-medium text-white flex items-center gap-2 group/edit">
                                <span className={!item.isVerified ? 'text-amber-200' : ''}>{item.name}</span>
                                {isReprocessed && <span className="text-[10px] bg-blue-900 text-blue-300 px-1.5 rounded flex items-center gap-1"><Bot className="w-3 h-3"/> Auto</span>}
                                <div className="opacity-0 group-hover/edit:opacity-100 flex items-center gap-1 transition-opacity">
                                    <button 
                                        onClick={() => startEditingItem(idx, item.name)}
                                        className="text-slate-500 hover:text-blue-400 p-1 rounded hover:bg-slate-700"
                                        title="Editar Nome Manualmente"
                                    >
                                        <Pencil className="w-3 h-3"/>
                                    </button>
                                    <button 
                                        onClick={() => fetchSuggestions(batchId, idx, item.name)}
                                        className="text-slate-500 hover:text-amber-400 p-1 rounded hover:bg-slate-700"
                                        title="Sugerir Variações com IA"
                                        disabled={isLoadingSuggestions}
                                    >
                                        {isLoadingSuggestions ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3"/>}
                                    </button>
                                </div>
                            </div>
                        )}
                        <span className="text-xs text-slate-600 block">{item.sku}</span>
                    </div>
                )}
            </td>
            <td className="p-3 text-center">
                <div className="flex items-center justify-center">
                    <input 
                        type="number"
                        min="1"
                        value={item.packQuantity}
                        onChange={(e) => updateItemPackQuantity(batchId, idx, parseInt(e.target.value))}
                        className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-center font-bold text-white focus:border-amber-500 focus:outline-none"
                    />
                </div>
            </td>
            <td className="p-3 text-center">
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-slate-500 mb-0.5">Ref. R$ {item.price.toFixed(2)}</span>
                    <div className="flex items-center justify-center gap-1 bg-slate-950/50 p-0.5 rounded inline-flex border border-slate-800">
                        <button 
                            onClick={() => updateItemStrategy(batchId, idx, 'pack')}
                            className={`p-1 rounded transition-all flex items-center gap-1 ${(!item.priceStrategy || item.priceStrategy === 'pack') ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                            title={`Lote: O valor R$ {item.price.toFixed(2)} é o preço da caixa com ${item.packQuantity} unidades.`}
                        >
                            <BoxSelect className="w-3 h-3"/>
                        </button>
                        <button 
                            onClick={() => updateItemStrategy(batchId, idx, 'unit')}
                            className={`p-1 rounded transition-all flex items-center gap-1 ${item.priceStrategy === 'unit' ? 'bg-amber-500 text-white shadow' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                            title={`Unitário: O valor R$ {item.price.toFixed(2)} é o preço de UMA unidade.`}
                        >
                            <Coins className="w-3 h-3"/>
                        </button>
                    </div>
                </div>
            </td>
            <td className="p-3 text-right font-medium text-slate-300">
                R$ {totalLotPrice.toFixed(2)}
            </td>
            <td className="p-3 text-right font-bold text-amber-400 bg-slate-800/20 text-lg">
                R$ {item.unitPrice.toFixed(2)}
            </td>
            <td className="p-3 text-center">
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => toggleItemVerification(batchId, idx)}
                        className={`p-2 rounded transition-colors ${item.isVerified ? 'text-green-500 hover:bg-green-900/20' : 'text-slate-600 hover:bg-slate-700 hover:text-green-400'}`}
                        title={item.isVerified ? "Desmarcar Identificação" : "Confirmar e Mover para Prontos"}
                    >
                        {item.isVerified ? <CheckCircle className="w-4 h-4" /> : <Check className="w-4 h-4"/>}
                    </button>
                    <button 
                        onClick={() => handleRequestAction('ban', batchId, idx, item.name)}
                        className="text-slate-600 hover:text-red-500 p-2 rounded hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-all"
                        title="Bloquear/Banir Item (Lixeira)"
                    >
                        <Ban className="w-4 h-4"/>
                    </button>
                     <button 
                        onClick={() => handleRequestAction('delete', batchId, idx, item.name)}
                        className="text-slate-600 hover:text-red-500 p-2 rounded hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remover Item da Lista"
                    >
                        <Trash2 className="w-4 h-4"/>
                    </button>
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

  const renderNamingRulesModal = () => {
      const onAdd = addNamingRule;
      const onRemove = removeNamingRule;
      const onClose = () => setShowNamingRules(false);
      const onApply = () => applyRulesRetroactively(null); // Apply globally

      return (
           <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 w-full max-w-2xl rounded-xl border border-slate-700 flex flex-col shadow-2xl max-h-[80vh]">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-xl">
                      <h3 className="font-bold text-white flex items-center gap-2">
                          <Type className="w-5 h-5 text-indigo-500"/> Regras de Concordância (SEO)
                      </h3>
                      <button onClick={onClose}><X className="w-6 h-6 text-slate-500 hover:text-white"/></button>
                  </div>
                  
                  <div className="p-4 bg-slate-900 space-y-4">
                      <p className="text-sm text-slate-400">
                          Padronize nomes antes da análise de lote. Formato: <strong>CATEGORIA + VOLUME + NOME + TIPO</strong>.
                          <br/>Ex: "Skol 350ml" --- "CERVEJA 350ML SKOL LATA"
                      </p>

                      <div className="flex gap-2 items-end">
                          <div className="flex-1">
                              <label className="text-[10px] text-slate-500 uppercase">Contém (ex: Cerveja, 350ml)</label>
                              <input 
                                  type="text" 
                                  placeholder="Separe por vírgula" 
                                  value={namingRuleTerms}
                                  onChange={(e) => setNamingRuleTerms(e.target.value)}
                                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-indigo-500 focus:outline-none text-xs"
                              />
                          </div>
                          <div className="w-24">
                              <label className="text-[10px] text-slate-500 uppercase">Renomear Cat.</label>
                              <input 
                                  type="text" 
                                  placeholder="Ex: CERVEJA"
                                  value={namingRuleCategory}
                                  onChange={(e) => setNamingRuleCategory(e.target.value)}
                                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-indigo-500 focus:outline-none text-xs"
                              />
                          </div>
                          <div className="w-24">
                              <label className="text-[10px] text-slate-500 uppercase">Tipo Emb.</label>
                              <input 
                                  type="text" 
                                  placeholder="Ex: LATA"
                                  value={namingRuleSuffix}
                                  onChange={(e) => setNamingRuleSuffix(e.target.value)}
                                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-indigo-500 focus:outline-none text-xs"
                              />
                          </div>
                          <button 
                              onClick={onAdd}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded font-bold h-9"
                          >
                              <Plus className="w-4 h-4"/>
                          </button>
                      </div>

                      <div className="border-t border-slate-800 pt-4 max-h-60 overflow-y-auto space-y-2">
                          {globalNamingRules.length === 0 && (
                              <p className="text-center text-slate-600 italic">Nenhuma regra definida.</p>
                          )}
                          {globalNamingRules.map(rule => (
                              <div key={rule.id} className="flex justify-between items-center bg-slate-800 p-2 rounded border border-slate-700">
                                  <div className="flex flex-col">
                                      <span className="text-xs text-slate-400">Contém: <strong className="text-white">[{rule.terms.join(', ')}]</strong></span>
                                      <span className="text-xs text-indigo-300">
                                          → {rule.category ? rule.category : '(Manter)'} ... {rule.suffix ? rule.suffix : '(Manter)'}
                                      </span>
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
                               <RefreshCw className="w-4 h-4"/> Aplicar Regras em Tudo
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
      {showNamingRules && renderNamingRulesModal()}
      {showGlobalRules && renderRulesModal(true)}
      {showPackRules && selectedSupplier && renderRulesModal(false)}

      {/* Blacklist Modal */}
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
                <div className="p-4 border-b border-slate-700 flex flex-col md:flex-row justify-between items-center bg-slate-800 rounded-t-xl shrink-0 gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-white">Detalhes da Cotação</h3>
                        <p className="text-sm text-slate-400">
                             {viewingBatch.sourceType === 'file' ? viewingBatch.fileName : 'Texto Importado'} • {new Date(viewingBatch.timestamp).toLocaleString()}
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-4 flex-1 justify-end">
                        <div className="relative w-full max-w-xs">
                            <Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-500" />
                            <input type="text" placeholder="Filtrar produtos na lista..." value={detailsSearchTerm} onChange={(e) => setDetailsSearchTerm(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md py-1.5 pl-9 pr-4 text-sm text-white focus:border-amber-500 focus:outline-none"/>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded border border-slate-700">
                            <button onClick={() => updateBatchStrategy(viewingBatch.id, 'pack')} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs hover:bg-slate-700 transition-colors text-blue-400 font-medium"><BoxSelect className="w-3 h-3"/> Preço Lote</button>
                            <div className="w-px h-4 bg-slate-700"></div>
                            <button onClick={() => updateBatchStrategy(viewingBatch.id, 'unit')} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs hover:bg-slate-700 transition-colors text-amber-400 font-medium"><Coins className="w-3 h-3"/> Preço Unitário</button>
                        </div>
                        <button onClick={() => setViewingBatch(null)} className="text-slate-400 hover:text-white p-2"><XCircle className="w-8 h-8" /></button>
                    </div>
                </div>
                
                <div className="overflow-auto p-4 flex-1 space-y-6 bg-slate-900">
                    {(() => {
                        const filteredItems = viewingBatch.items.map((it, idx) => ({ item: it, originalIndex: idx }))
                            .filter(x => {
                                if (!detailsSearchTerm) return true;
                                const term = detailsSearchTerm.toLowerCase();
                                return x.item.name.toLowerCase().includes(term) || x.item.sku.toLowerCase().includes(term);
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
                    <span>{viewingBatch.items.length} itens no total</span>
                    <button onClick={() => setViewingBatch(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded">Fechar</button>
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
                onClick={() => setShowNamingRules(true)}
                className="w-full flex items-center justify-center gap-2 p-1.5 bg-transparent border border-slate-600 hover:border-slate-400 text-slate-400 hover:text-white rounded text-[10px] font-bold transition-all uppercase"
                title="Regras para padronizar nomes (SEO) antes da análise de lote"
            >
                <Type className="w-3 h-3" /> Regras de Concordância (SEO)
            </button>
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
                   {isEditingName ? (
                       <div className="flex items-center gap-2 bg-slate-900 p-1 rounded border border-amber-500/50">
                           <input value={editingNameValue} onChange={(e) => setEditingNameValue(e.target.value)} className="bg-transparent text-white font-bold text-xl focus:outline-none px-2" autoFocus />
                           <button onClick={() => saveRename(selectedSupplier.id)} className="p-1 hover:bg-green-900/50 rounded text-green-400"><Save className="w-5 h-5"/></button>
                           <button onClick={cancelRename} className="p-1 hover:bg-red-900/50 rounded text-red-400"><X className="w-5 h-5"/></button>
                       </div>
                   ) : (
                       <div className="flex items-center gap-2 group">
                           <h2 className="text-2xl font-bold text-white flex items-center gap-2 cursor-default">
                                {selectedSupplier.name}
                           </h2>
                           <button onClick={() => startRenaming(selectedSupplier)} className="text-slate-500 hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Pencil className="w-4 h-4" />
                           </button>
                       </div>
                   )}
                   
                   {!selectedSupplier.isEnabled && <span className="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded-full border border-red-900">Fornecedor Desabilitado</span>}
                </div>
                <p className="text-slate-400 text-sm mt-1">Gerencie as cotações deste fornecedor aqui.</p>
              </div>
              
              <div className="flex items-center gap-2">
                 <button 
                    onClick={() => setShowPackRules(true)}
                    className="text-slate-400 hover:text-white p-2 rounded hover:bg-slate-700/50 transition-colors flex items-center gap-2 text-xs border border-slate-700"
                    title="Exceções específicas para este fornecedor (Sobrescrevem regras globais)"
                 >
                    <Settings className="w-4 h-4 text-blue-500"/> Exceções de Lote
                 </button>

                 <div className="w-px h-6 bg-slate-700 mx-2"></div>

                 <button 
                    onClick={() => setShowBlacklist(true)}
                    className="text-slate-400 hover:text-white p-2 rounded hover:bg-slate-700/50 transition-colors flex items-center gap-2 text-xs border border-slate-700"
                    title="Ver itens bloqueados"
                 >
                    <Ban className="w-4 h-4 text-red-500"/> Lista Negra ({selectedSupplier.blacklist?.length || 0})
                 </button>

                 <div className="w-px h-6 bg-slate-700 mx-2"></div>

                 <button 
                    onClick={() => deleteSupplier(selectedSupplier.id)} 
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20 p-2 rounded transition-colors flex items-center gap-2 text-xs"
                 >
                    <Trash2 className="w-4 h-4" /> Excluir
                 </button>
              </div>
            </div>

            {/* Input Grid - 3 Columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

               {/* 2. Link Import */}
               <div className="bg-slate-900 rounded-lg p-4 border border-slate-700 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-2 text-slate-300">
                      <Cloud className="w-5 h-5 text-blue-500" />
                      <span className="text-sm font-medium">Importar Link (Nuvem)</span>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Cole link público (Drive/Dropbox)" 
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white mb-2 focus:border-blue-500 focus:outline-none"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                  />
                  <button 
                    onClick={() => handleUrlImport(selectedSupplier.id)}
                    disabled={!importUrl.trim() || isImportingUrl}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs py-1.5 px-3 rounded flex items-center justify-center gap-2"
                  >
                     {isImportingUrl ? <Loader2 className="w-3 h-3 animate-spin"/> : <LinkIcon className="w-3 h-3"/>}
                     {isImportingUrl ? 'Baixando...' : 'Processar Link'}
                  </button>
               </div>

               {/* 3. Text Paste */}
               <div className="bg-slate-900 rounded-lg p-3 border border-slate-700 flex flex-col">
                  <textarea 
                    className="flex-1 bg-transparent resize-none focus:outline-none text-sm mb-2"
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
                                            onClick={() => setViewingBatch(quote)}
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
