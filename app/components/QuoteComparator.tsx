import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Supplier, ForecastItem, CartItem, ProductMapping, MasterProduct } from '../types';
import { ShoppingCart, Package, ChevronDown, ChevronRight, X, Link as LinkIcon, RefreshCw, ChevronLeft, GripVertical, Merge, Tags, LayoutGrid, Sparkles, Box, Unlink, Search, TrendingUp, TrendingDown, BarChart2 } from 'lucide-react';

interface QuoteComparatorProps {
  suppliers: Supplier[];
  forecast: ForecastItem[];
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  updateForecast: (sku: string, newQty: number) => void;
  productMappings: ProductMapping[];
  ignoredMappings: ProductMapping[];
  addMapping: (supplierProductName: string, targetSku: string) => void;
  removeMapping: (supplierProductName: string) => void;
  ignoreMapping: (supplierProductName: string, targetSku: string) => void;
  salesConfig?: {
      historyDays: number;
      inflation: number;
      forecastDays: number;
      lastImportDate?: string;
  };
  considerStock?: boolean;
  setConsiderStock?: React.Dispatch<React.SetStateAction<boolean>>;
  masterProducts?: MasterProduct[];
  hiddenProductIds?: Set<string>;
  showInactive?: boolean;
}

interface VariationOption {
    quoteId: string;
    supplierId: string;
    supplierName: string;
    productName: string;
    packQuantity: number;
    packPrice: number; // Preço do Lote Completo
    unitPrice: number; // Preço de 1 Unidade
    timestamp: number;
}

interface UnifiedRow {
    type: 'forecast' | 'orphan';
    id: string; 
    sku: string;
    name: string;
    category: string;
    qtyNeeded: number; 
    totalSold: number;
    currentStock: number;
    bestUnitPrice: number;
    bestSupplierId: string | null;
    bestOptionsPerSupplier: {
        [supplierId: string]: VariationOption | null
    };
    allVariations: VariationOption[];
}

const ITEMS_PER_PAGE = 15;

// ─── Stock Market ────────────────────────────────────────────────────────────

interface StockMarketEntry {
  productName: string;
  supplierName: string;
  supplierId: string;
  currentPrice: number;   // unitPrice mais recente
  previousPrice: number;  // unitPrice anterior
  change: number;         // currentPrice - previousPrice
  changePct: number;      // variação em %
  date: number;           // timestamp da cotação mais recente
}

/**
 * Calcula maiores altas e baixas da semana a partir das quotes dos suppliers.
 * Chamado manualmente para não pesar o app.
 */
function calcPriceMovers(suppliers: Supplier[]): {
  topGainers: StockMarketEntry[];
  topLosers: StockMarketEntry[];
  lastUpdated: number | null;
} {
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const priceMap = new Map<string, { price: number; date: number; supplierName: string; productName: string; supplierId: string }[]>();

  for (const supplier of suppliers) {
    const savedQuotes = (supplier.quotes || [])
      .filter(q => q.status === 'completed' && q.items.length > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const batch of savedQuotes) {
      for (const item of batch.items) {
        if (!item.isVerified || item.unitPrice <= 0) continue;
        const key = `${supplier.id}|${item.name.toLowerCase().trim()}`;
        if (!priceMap.has(key)) priceMap.set(key, []);
        priceMap.get(key)!.push({
          price: item.unitPrice,
          date: batch.timestamp,
          supplierName: supplier.name,
          productName: item.name,
          supplierId: supplier.id,
        });
      }
    }
  }

  const entries: StockMarketEntry[] = [];
  let lastUpdated: number | null = null;

  for (const [, records] of priceMap) {
    if (records.length < 2) continue;
    records.sort((a, b) => a.date - b.date);
    const latest = records[records.length - 1];
    const previous = records[records.length - 2];
    if (now - latest.date > ONE_WEEK) continue;
    const change = latest.price - previous.price;
    const changePct = previous.price > 0 ? (change / previous.price) * 100 : 0;
    if (Math.abs(changePct) < 0.1) continue;
    if (latest.date > (lastUpdated ?? 0)) lastUpdated = latest.date;
    entries.push({ productName: latest.productName, supplierName: latest.supplierName, supplierId: latest.supplierId, currentPrice: latest.price, previousPrice: previous.price, change, changePct, date: latest.date });
  }

  const sorted = entries.sort((a, b) => b.changePct - a.changePct);
  const topGainers = sorted.filter(e => e.changePct > 0).slice(0, 5);
  const topLosers  = [...sorted].reverse().filter(e => e.changePct < 0).slice(0, 5);
  return { topGainers, topLosers, lastUpdated };
}

const QuoteComparator: React.FC<QuoteComparatorProps> = ({ 
    suppliers, 
    forecast, 
    cart, 
    setCart,
    updateForecast,
    productMappings,
    ignoredMappings,
    addMapping,
    removeMapping,
    ignoreMapping,
    salesConfig,
    considerStock,
    setConsiderStock,
    masterProducts = [],
    hiddenProductIds = new Set(),
    showInactive = false,
}) => {
  const [stockMarketData, setStockMarketData] = useState<{ topGainers: StockMarketEntry[]; topLosers: StockMarketEntry[]; lastUpdated: number | null } | null>(null);
  const [stockMarketOpen, setStockMarketOpen] = useState(true);
  const [stockMarketLoading, setStockMarketLoading] = useState(false);

  const handleCalcMovers = useCallback(() => {
    setStockMarketLoading(true);
    // setTimeout para não bloquear o render
    setTimeout(() => {
      setStockMarketData(calcPriceMovers(suppliers));
      setStockMarketLoading(false);
    }, 0);
  }, [suppliers]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [categorySearchTerms, setCategorySearchTerms] = useState<Record<string, string>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<'sales' | 'alpha'>('sales');
  const [allProcessedRows, setAllProcessedRows] = useState<UnifiedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
      productName: string;
      qtyNeeded: number;
      supplierName: string;
      variants: VariationOption[];
  } | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [packsToBuy, setPacksToBuy] = useState<number>(1);
  const [unitsToBuy, setUnitsToBuy] = useState<number>(0);

  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [mappingSourceProduct, setMappingSourceProduct] = useState<string | null>(null);
  const [mappingSearchTerm, setMappingSearchTerm] = useState('');
  const [unlinkConfirm, setUnlinkConfirm] = useState<{ productName: string } | null>(null);

  const toggleCategory = (cat: string) => {
      const newSet = new Set(collapsedCategories);
      if (newSet.has(cat)) newSet.delete(cat);
      else newSet.add(cat);
      setCollapsedCategories(newSet);
  };

  const toggleRow = (id: string) => {
      const newSet = new Set(expandedRows);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setExpandedRows(newSet);
  };

  const normalizeToken = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); 

  const fixEncoding = (str: string) => {
      if (!str) return "";
      const replacements: Record<string, string> = { 'Ã¡': 'á', 'Ã ': 'à', 'Ã¢': 'â', 'Ã£': 'ã', 'Ã¤': 'ä', 'Ã©': 'é', 'Ã¨': 'è', 'Ãª': 'ê', 'Ã«': 'ë', 'Ã­': 'í', 'Ã¬': 'ì', 'Ã®': 'î', 'Ã¯': 'ï', 'Ã³': 'ó', 'Ã²': 'ò', 'Ã´': 'ô', 'Ãµ': 'õ', 'Ã¶': 'ö', 'Ãº': 'ú', 'Ã¹': 'ù', 'Ã»': 'û', 'Ã¼': 'ü', 'Ã§': 'ç', 'Ã±': 'ñ', 'Â': '', 'ÃƒÂ': 'Ã' };
      let result = str;
      Object.entries(replacements).forEach(([bad, good]) => { if (result.includes(bad)) result = result.split(bad).join(good); });
      return result;
  };

  const extractNumbers = (str: string) => (str.match(/\d+/g) || []).map(Number);

  const calculateMatchScore = (salesName: string, supplierName: string) => {
      const numsA = extractNumbers(salesName).filter(n => n > 10);
      const numsB = extractNumbers(supplierName).filter(n => n > 10);
      for (const nA of numsA) if (numsB.length > 0 && !numsB.includes(nA)) return 0;
      for (const nB of numsB) if (numsA.length > 0 && !numsA.includes(nB)) return 0;
      const sTokens = salesName.split(/\s+/).map(normalizeToken).filter(t => t.length > 1);
      const supTokens = supplierName.split(/\s+/).map(normalizeToken).filter(t => t.length > 1);
      if (sTokens.length === 0 || supTokens.length === 0) return 0;
      let matches = 0;
      sTokens.forEach(st => { if (supTokens.some(supt => supt.includes(st) || st.includes(supt))) matches++; });
      return matches / sTokens.length;
  };

  const getAutoCategory = (name: string): string => {
      const n = name.toUpperCase();
      if (n.includes("CERVEJA")) return "Cervejas";
      if (n.includes("REFRIGERANTE") || n.includes("COCA") || n.includes("PEPSI")) return "Refrigerantes";
      if (n.includes("AGUA") || n.includes("ÁGUA")) return "Águas";
      if (n.includes("SUCO")) return "Sucos";
      if (n.includes("WHISKY") || n.includes("GIN") || n.includes("VODKA") || n.includes("CACHAÇA")) return "Destilados";
      if (n.includes("VINHO")) return "Vinhos";
      if (n.includes("CHOPP")) return "Chopps";
      if (n.includes("ENERGÉTICO") || n.includes("MONSTER") || n.includes("REDBULL")) return "Energéticos";
      if (n.includes("GELO")) return "Gelo";
      if (n.includes("CARVÃO")) return "Carvão";
      if (n.includes("DOCE") || n.includes("HALLS") || n.includes("TRIDENT") || n.includes("CHOCOLATE")) return "Bomboniere";
      if (n.includes("CHIPS") || n.includes("SALGADINHO")) return "Salgadinhos";
      return "Outros / Sem Categoria";
  };

  const getDbCategory = (sku: string): string => masterProducts.find(p => p.sku === sku)?.category || "Sem Categoria no Banco";

  const processQuotes = useCallback(() => {
    setIsProcessing(true);
    setTimeout(() => {
        const enabledSuppliers = suppliers.filter(s => s.isEnabled);
        const variationsByCanonicalId = new Map<string, VariationOption[]>();
        
        enabledSuppliers.forEach(supplier => {
            [...supplier.quotes].sort((a, b) => b.timestamp - a.timestamp).forEach(batch => {
                if (batch.status !== 'completed') return;
                batch.items.forEach(q => {
                    const fixedQuoteName = fixEncoding(q.name);
                    const normName = normalizeToken(fixedQuoteName);
                    const mapping = productMappings.find(m => m.supplierProductNameNormalized === normName);
                    let canonicalId: string | null = mapping ? mapping.targetSku : null;

                    if (!canonicalId) {
                        let bestScore = 0;
                        let bestMatchSku = null;
                        for (const item of forecast) {
                            if (!item.sku) continue;
                            if (ignoredMappings.some(m => m.supplierProductNameNormalized === normName && m.targetSku === item.sku)) continue;
                            const score = calculateMatchScore(fixEncoding(item.name), fixedQuoteName);
                            if (score > bestScore) { bestScore = score; bestMatchSku = item.sku; }
                        }
                        if (bestScore >= 0.65) canonicalId = bestMatchSku;
                    }

                    if (!canonicalId) canonicalId = `VIRT-${normName}`;

                    // CORREÇÃO CRÍTICA: packPrice deve ser SEMPRE o unitário * quantidade da embalagem
                    // Se o fornecedor indicou que 5,79 é a UNIDADE, o preço do lote de 24 deve ser 138,96.
                    const variant: VariationOption = {
                        quoteId: `${supplier.id}-${batch.id}-${q.name}`,
                        supplierId: supplier.id,
                        supplierName: supplier.name,
                        productName: fixedQuoteName,
                        packQuantity: q.packQuantity,
                        packPrice: q.unitPrice * q.packQuantity, 
                        unitPrice: q.unitPrice,
                        timestamp: batch.timestamp
                    };
                    const currentList = variationsByCanonicalId.get(canonicalId) || [];
                    variationsByCanonicalId.set(canonicalId, [...currentList, variant]);
                });
            });
        });

        const finalRows: UnifiedRow[] = [];
        const processedCanonicalIds = new Set<string>();

        forecast.forEach(item => {
            const vars = variationsByCanonicalId.get(item.sku) || [];
            processedCanonicalIds.add(item.sku);
            let finalQtyNeeded = item.suggestedQty;
            if (considerStock && item.currentStock !== undefined) finalQtyNeeded = Math.max(0, item.suggestedQty - item.currentStock);
            const cat = categoryMode === 'database' ? getDbCategory(item.sku) : getAutoCategory(fixEncoding(item.name));
            const winner = [...vars].sort((a, b) => a.unitPrice - b.unitPrice)[0];
            const optionsPerSup: Record<string, VariationOption | null> = {};
            enabledSuppliers.forEach(s => {
                const supVars = vars.filter(v => v.supplierId === s.id).sort((a,b) => a.unitPrice - b.unitPrice);
                optionsPerSup[s.id] = supVars[0] || null;
            });
            finalRows.push({ type: 'forecast', id: item.sku, sku: item.sku, name: fixEncoding(item.name), category: cat, qtyNeeded: finalQtyNeeded, totalSold: item.totalSold || 0, currentStock: item.currentStock || 0, bestUnitPrice: winner ? winner.unitPrice : 0, bestSupplierId: winner ? winner.supplierId : null, bestOptionsPerSupplier: optionsPerSup, allVariations: vars });
        });

        variationsByCanonicalId.forEach((vars, cid) => {
            if (processedCanonicalIds.has(cid)) return;
            const firstVar = vars[0];
            const cat = categoryMode === 'database' ? getDbCategory(cid.replace('VIRT-', '')) : getAutoCategory(firstVar.productName);
            const winner = [...vars].sort((a, b) => a.unitPrice - b.unitPrice)[0];
            const optionsPerSup: Record<string, VariationOption | null> = {};
            enabledSuppliers.forEach(s => {
                const supVars = vars.filter(v => v.supplierId === s.id).sort((a,b) => a.unitPrice - b.unitPrice);
                optionsPerSup[s.id] = supVars[0] || null;
            });
            finalRows.push({ type: 'orphan', id: cid, sku: cid.startsWith('VIRT-') ? 'S/N' : cid, name: firstVar.productName, category: cat, qtyNeeded: 0, totalSold: 0, currentStock: 0, bestUnitPrice: winner ? winner.unitPrice : 0, bestSupplierId: winner ? winner.supplierId : null, bestOptionsPerSupplier: optionsPerSup, allVariations: vars });
        });
        setAllProcessedRows(finalRows);
        setIsProcessing(false);
    }, 100);
  }, [suppliers, forecast, productMappings, ignoredMappings, considerStock, categoryMode, masterProducts]);

  useEffect(() => { processQuotes(); }, [productMappings, ignoredMappings, considerStock, categoryMode, processQuotes]);

  const groupedData = useMemo(() => {
      const groups: Record<string, UnifiedRow[]> = {};
      allProcessedRows.forEach(row => {
          // Filtra produtos ocultos (a menos que showInactive esteja ativo)
          const rowNormalizedId = row.id.toLowerCase().replace(/\s+/g, '_');
          if (!showInactive && hiddenProductIds.has(rowNormalizedId)) return;

          const cat = row.category || "Sem Categoria";
          if (!groups[cat]) groups[cat] = [];
          const matchGlobal = !searchTerm || row.name.toLowerCase().includes(searchTerm.toLowerCase()) || row.sku.toLowerCase().includes(searchTerm.toLowerCase());
          const catSearch = categorySearchTerms[cat] || '';
          const matchLocal = !catSearch || row.name.toLowerCase().includes(catSearch.toLowerCase());
          if (matchGlobal && matchLocal) groups[cat].push(row);
      });
      return groups;
  }, [allProcessedRows, searchTerm, categorySearchTerms, hiddenProductIds, showInactive]);

  const handlePacksChange = (val: number, packQty: number) => {
      const p = Math.max(0, val);
      setPacksToBuy(p);
      setUnitsToBuy(Math.round(p * packQty));
  };
  const handleUnitsChange = (val: number, packQty: number) => {
      const u = Math.max(0, val);
      setUnitsToBuy(u);
      setPacksToBuy(u / packQty);
  };

  const openSelectionModal = (row: UnifiedRow, supplierId: string) => {
      const variants = row.allVariations.filter(v => v.supplierId === supplierId).sort((a,b) => a.unitPrice - b.unitPrice);
      if (variants.length === 0) return;
      const v = variants[0];
      setModalData({ productName: row.name, qtyNeeded: row.qtyNeeded, supplierName: v.supplierName, variants });
      setSelectedVariantId(v.quoteId);
      const initPacks = row.qtyNeeded > 0 ? Math.ceil(row.qtyNeeded / v.packQuantity) : 1;
      setPacksToBuy(initPacks);
      setUnitsToBuy(initPacks * v.packQuantity);
      setIsModalOpen(true);
  };

  const confirmAddToCart = () => {
      if (!modalData || !selectedVariantId) return;
      const v = modalData.variants.find(v => v.quoteId === selectedVariantId);
      if (!v) return;
      setCart(prev => {
        const id = `${v.supplierId}-${v.productName}-${v.packQuantity}`;
        const ex = prev.find(p => p.id === id);
        if (ex) return prev.map(p => p.id === id ? { ...p, quantityToBuy: p.quantityToBuy + packsToBuy, totalCost: (p.quantityToBuy + packsToBuy) * v.packPrice } : p);
        return [...prev, { id, sku: v.productName.substring(0,10), productName: v.productName, supplierId: v.supplierId, supplierName: v.supplierName, packQuantity: v.packQuantity, packPrice: v.packPrice, quantityToBuy: packsToBuy, totalCost: v.packPrice * packsToBuy }];
      });
      setIsModalOpen(false);
  };

  const PaginatedTable = ({ rows }: { rows: UnifiedRow[] }) => {
      const [page, setPage] = useState(1);
      const [draggedRow, setDraggedRow] = useState<UnifiedRow | null>(null);
      const paginated = rows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

      return (
          <div className="bg-slate-900/40 rounded-b-lg border-t border-slate-700 overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-950 text-slate-500 text-[10px] uppercase tracking-wider sticky top-0 z-20">
                    <tr><th className="p-4 w-8"></th><th className="p-4">Produto</th>{suppliers.filter(s => s.isEnabled).map(s => <th key={s.id} className="p-4 text-center w-32">{s.name}</th>)}<th className="p-4 text-right bg-slate-900 sticky right-0">Melhor</th></tr>
                </thead>
                <tbody className="text-sm text-slate-300 divide-y divide-slate-800">
                    {paginated.map((row, idx) => {
                        const isExpanded = expandedRows.has(row.id);
                        return (
                            <React.Fragment key={idx}>
                                <tr 
                                    className={`transition-all ${isExpanded ? 'bg-slate-800/80' : 'hover:bg-slate-800/60'}`}
                                    draggable onDragStart={() => setDraggedRow(row)} onDragOver={(e) => { e.preventDefault(); }} onDrop={() => { if(draggedRow && draggedRow.id !== row.id && confirm(`Agrupar "${draggedRow.name}" em "${row.name}"?`)) draggedRow.allVariations.forEach(v => addMapping(v.productName, row.id)); }}
                                >
                                    <td className="p-2 text-center cursor-grab text-slate-600"><GripVertical className="w-4 h-4 mx-auto"/></td>
                                    <td className="p-4">
                                        <div className="flex items-start gap-2">
                                            <button onClick={() => toggleRow(row.id)} className="mt-1 p-1 rounded hover:bg-slate-700 text-amber-500">{isExpanded ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}</button>
                                            <div><div className="font-bold text-white flex items-center gap-2">{row.name} <button onClick={() => { setMappingSourceProduct(row.name); setIsMappingModalOpen(true); }} className="text-slate-600 hover:text-amber-500"><LinkIcon className="w-3.5 h-3.5"/></button></div><div className="flex gap-2 text-[10px] mt-1"><span className="text-slate-500">SKU: {row.sku}</span>{row.totalSold > 0 && <span className="text-indigo-400 font-bold">Vendas: {row.totalSold}</span>}</div></div>
                                        </div>
                                    </td>
                                    {suppliers.filter(s => s.isEnabled).map(s => {
                                        const opt = row.bestOptionsPerSupplier[s.id];
                                        return <td key={s.id} className="p-4 text-center border-l border-slate-800/50">{opt ? <div className="flex flex-col items-center gap-1"><span className="font-bold text-xs">R$ {opt.unitPrice.toFixed(2)}</span><button onClick={() => openSelectionModal(row, s.id)} className="text-[10px] px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-400 hover:bg-slate-700">+ N.P</button></div> : '-'}</td>;
                                    })}
                                    <td className="p-4 text-right bg-slate-900/80 sticky right-0 border-l border-slate-800">{row.bestSupplierId ? <div className="flex flex-col items-end"><span className="text-amber-400 font-black text-sm">R$ {row.bestUnitPrice.toFixed(2)}</span><span className="text-[10px] text-slate-500 truncate max-w-[80px]">{suppliers.find(sup => sup.id === row.bestSupplierId)?.name}</span></div> : '-'}</td>
                                </tr>
                                {isExpanded && (
                                    <tr>
                                        <td colSpan={10} className="bg-slate-950/80 p-4 border-b border-slate-800">
                                            <div className="bg-slate-900 rounded border border-slate-700 overflow-hidden text-xs">
                                                <table className="w-full">
                                                    <thead className="text-slate-500 border-b border-slate-800"><tr><th className="p-2 text-left">Fornecedor</th><th className="p-2 text-left">Nome na Cotação</th><th className="p-2 text-center">Lote</th><th className="p-2 text-right">Preço Cx</th><th className="p-2 text-right">Unit.</th><th className="p-2 text-center">Ações</th></tr></thead>
                                                    <tbody>
                                                        {row.allVariations.sort((a,b)=>a.unitPrice-b.unitPrice).map((v, i) => (
                                                            <tr key={i} className="hover:bg-slate-800 border-b border-slate-800 last:border-0">
                                                                <td className="p-2 text-amber-500">{v.supplierName}</td>
                                                                <td className="p-2">{v.productName}</td>
                                                                <td className="p-2 text-center text-slate-500">x{v.packQuantity}</td>
                                                                <td className="p-2 text-right">R$ {v.packPrice.toFixed(2)}</td>
                                                                <td className="p-2 text-right font-bold text-green-400">R$ {v.unitPrice.toFixed(2)}</td>
                                                                <td className="p-2 text-center"><button onClick={() => setUnlinkConfirm({ productName: v.productName })} className="p-1 hover:text-red-500" title="Desvincular"><Unlink className="w-3.5 h-3.5"/></button></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
          </div>
      );
  };

  return (
    <div className="space-y-6 h-full overflow-y-auto pr-2 pb-20 custom-scrollbar">

        {/* ── STOCK MARKET PANEL ─────────────────────────────────────────── */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setStockMarketOpen(o => !o)}
              className="flex items-center gap-2 flex-1 text-left"
            >
              <BarChart2 className="w-4 h-4 text-amber-400"/>
              <span className="font-bold text-sm text-white">Variação de Preços</span>
              {stockMarketData?.lastUpdated && (
                <span className="text-[10px] text-slate-500">
                  calculado em {new Date(stockMarketData.lastUpdated).toLocaleDateString('pt-BR')}
                </span>
              )}
              {stockMarketOpen ? <ChevronDown className="w-4 h-4 text-slate-500 ml-1"/> : <ChevronRight className="w-4 h-4 text-slate-500 ml-1"/>}
            </button>
            <div className="flex items-center gap-2 shrink-0">
              {stockMarketData && (
                <>
                  {stockMarketData.topGainers.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-green-400 font-semibold">
                      <TrendingUp className="w-3.5 h-3.5"/> {stockMarketData.topGainers.length}
                    </span>
                  )}
                  {stockMarketData.topLosers.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-red-400 font-semibold">
                      <TrendingDown className="w-3.5 h-3.5"/> {stockMarketData.topLosers.length}
                    </span>
                  )}
                </>
              )}
              <button
                onClick={handleCalcMovers}
                disabled={stockMarketLoading}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${stockMarketLoading ? 'animate-spin' : ''}`}/>
                {stockMarketData ? 'Atualizar' : 'Calcular'}
              </button>
            </div>
          </div>

          {stockMarketOpen && stockMarketData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 border-t border-slate-800">

              {/* Maiores Altas */}
              <div className="p-3">
                <div className="flex items-center gap-1.5 mb-2 px-1">
                  <TrendingUp className="w-3.5 h-3.5 text-green-400"/>
                  <span className="text-[11px] font-bold text-green-400 uppercase tracking-wider">Maiores Altas</span>
                </div>
                {stockMarketData.topGainers.length === 0 ? (
                  <p className="text-xs text-slate-600 px-1 py-2">Nenhuma alta esta semana</p>
                ) : (
                  <div className="space-y-1">
                    {stockMarketData.topGainers.map((entry, i) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800/60 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{entry.productName}</p>
                          <p className="text-[10px] text-slate-500 truncate">{entry.supplierName}</p>
                        </div>
                        <div className="flex items-center gap-3 ml-3 shrink-0">
                          <div className="text-right">
                            <p className="text-xs text-slate-500 line-through">R$ {entry.previousPrice.toFixed(2)}</p>
                            <p className="text-xs font-bold text-white">R$ {entry.currentPrice.toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-0.5 bg-green-900/30 border border-green-800/50 rounded px-1.5 py-0.5 min-w-[52px] justify-center">
                            <TrendingUp className="w-3 h-3 text-green-400"/>
                            <span className="text-[11px] font-bold text-green-400">+{entry.changePct.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Maiores Baixas */}
              <div className="p-3">
                <div className="flex items-center gap-1.5 mb-2 px-1">
                  <TrendingDown className="w-3.5 h-3.5 text-red-400"/>
                  <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">Maiores Baixas</span>
                </div>
                {stockMarketData.topLosers.length === 0 ? (
                  <p className="text-xs text-slate-600 px-1 py-2">Nenhuma baixa esta semana</p>
                ) : (
                  <div className="space-y-1">
                    {stockMarketData.topLosers.map((entry, i) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800/60 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{entry.productName}</p>
                          <p className="text-[10px] text-slate-500 truncate">{entry.supplierName}</p>
                        </div>
                        <div className="flex items-center gap-3 ml-3 shrink-0">
                          <div className="text-right">
                            <p className="text-xs text-slate-500 line-through">R$ {entry.previousPrice.toFixed(2)}</p>
                            <p className="text-xs font-bold text-white">R$ {entry.currentPrice.toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-0.5 bg-red-900/30 border border-red-800/50 rounded px-1.5 py-0.5 min-w-[52px] justify-center">
                            <TrendingDown className="w-3 h-3 text-red-400"/>
                            <span className="text-[11px] font-bold text-red-400">{entry.changePct.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {stockMarketOpen && !stockMarketData && (
            <div className="px-4 pb-4 text-center">
              <p className="text-xs text-slate-600">Clique em <span className="text-slate-400 font-medium">Calcular</span> para ver as maiores altas e baixas da semana</p>
            </div>
          )}
        </div>
        {/* ── FIM STOCK MARKET ───────────────────────────────────────────── */}

        {unlinkConfirm && (
            <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95">
                    <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Unlink className="text-red-500"/> Desvincular?</h3>
                    <p className="text-sm text-slate-400 mb-6">Deseja desvincular "<span className="text-amber-500">{unlinkConfirm.productName}</span>"?</p>
                    <div className="flex justify-end gap-3"><button onClick={() => setUnlinkConfirm(null)} className="px-4 py-2 text-slate-400">Cancelar</button><button onClick={() => { removeMapping(unlinkConfirm.productName); setUnlinkConfirm(null); }} className="px-6 py-2 bg-red-600 text-white rounded font-bold">Sim, desvincular</button></div>
                </div>
            </div>
        )}

        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex flex-col lg:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4 flex-1 w-full">
                <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" /><input type="text" placeholder="Pesquisa Global..." className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-9 text-sm text-white focus:outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700 text-[10px]">
                    <button onClick={() => setCategoryMode('database')} className={`px-2 py-1.5 rounded transition-all ${categoryMode === 'database' ? 'bg-amber-600 text-white shadow' : 'text-slate-500'}`}>Banco</button>
                    <button onClick={() => setCategoryMode('auto')} className={`px-2 py-1.5 rounded transition-all ${categoryMode === 'auto' ? 'bg-amber-600 text-white shadow' : 'text-slate-500'}`}>Automática</button>
                </div>
            </div>
            <button onClick={() => setConsiderStock?.(!considerStock)} className={`px-3 py-1.5 rounded text-xs font-bold border ${considerStock ? 'bg-blue-600/20 text-blue-400 border-blue-500' : 'bg-orange-600/20 text-orange-400 border-orange-500'}`}><Box className="w-3 h-3 inline mr-2"/>{considerStock ? 'Subtraindo Estoque' : 'Ignorando Estoque'}</button>
        </div>

        <div className="space-y-4">
            {Object.keys(groupedData).sort().map(cat => (
                <div key={cat} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-md">
                    <div className="flex items-center justify-between p-4 bg-slate-900/50 cursor-pointer" onClick={() => toggleCategory(cat)}>
                        <div className="flex items-center gap-3"><LayoutGrid className="w-4 h-4 text-indigo-400" /><div><h3 className="font-bold text-slate-200 uppercase text-xs">{cat}</h3><p className="text-[10px] text-slate-500">{groupedData[cat].length} produtos</p></div></div>
                    </div>
                    {!collapsedCategories.has(cat) && <PaginatedTable rows={groupedData[cat]} />}
                </div>
            ))}
        </div>

        {isMappingModalOpen && mappingSourceProduct && (
            <div className="fixed inset-0 z-[160] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 w-full max-w-lg rounded-xl border border-slate-700 flex flex-col max-h-[80vh]">
                     <div className="p-4 border-b border-slate-800 font-bold">Vincular Produto</div>
                     <div className="p-4 bg-slate-800 border-b border-slate-700"><input type="text" placeholder="Pesquisar item..." value={mappingSearchTerm} onChange={(e) => setMappingSearchTerm(e.target.value)} autoFocus className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"/></div>
                     <div className="flex-1 overflow-y-auto p-2">
                        {allProcessedRows.filter(r => (r.name.toLowerCase().includes(mappingSearchTerm.toLowerCase())) && r.name !== mappingSourceProduct).slice(0,50).map(item => (
                            <div key={item.id} onClick={() => { addMapping(mappingSourceProduct, item.id); setIsMappingModalOpen(false); }} className="p-3 hover:bg-amber-900/20 rounded cursor-pointer">
                                <div className="text-sm font-medium">{item.name}</div>
                            </div>
                        ))}
                     </div>
                     <div className="p-4 bg-slate-950 flex justify-end"><button onClick={() => setIsMappingModalOpen(false)} className="px-4 py-2 text-slate-400">Fechar</button></div>
                </div>
            </div>
        )}

        {isModalOpen && modalData && (
            <div className="fixed inset-0 z-[160] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 w-full max-w-md rounded-xl border border-slate-700 shadow-2xl overflow-hidden">
                    <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                        <div><h3 className="font-bold text-white">Adicionar Pedido</h3><p className="text-[10px] text-slate-500">{modalData.supplierName}</p></div>
                        <button onClick={() => setIsModalOpen(false)}><X className="w-5 h-5"/></button>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="bg-slate-800 p-3 rounded text-sm"><p className="font-bold text-white mb-1">{modalData.productName}</p><p className="text-green-400 text-xs">Meta: {modalData.qtyNeeded} un</p></div>
                        <div className="space-y-2">
                            {modalData.variants.map((v) => (
                                <div key={v.quoteId} onClick={() => { setSelectedVariantId(v.quoteId); handlePacksChange(modalData.qtyNeeded > 0 ? Math.ceil(modalData.qtyNeeded / v.packQuantity) : 1, v.packQuantity); }} className={`p-3 rounded border cursor-pointer transition-all ${selectedVariantId === v.quoteId ? 'bg-amber-900/20 border-amber-500' : 'bg-slate-800 border-slate-700'}`}>
                                    <div className="flex justify-between"><p className="text-xs font-medium">{v.productName}</p><p className="text-xs font-bold text-amber-500">Unit. R$ {v.unitPrice.toFixed(2)}</p></div>
                                    <p className="text-[10px] text-slate-500">Preço Cx ({v.packQuantity} un): R$ {v.packPrice.toFixed(2)}</p>
                                </div>
                            ))}
                        </div>
                        {selectedVariantId && (() => {
                            const v = modalData.variants.find(v => v.quoteId === selectedVariantId)!;
                            return (
                                <div className="bg-slate-950 p-4 rounded border border-slate-800 grid grid-cols-2 gap-4">
                                    <div><label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Caixas</label><input type="number" step="1" value={packsToBuy % 1 === 0 ? packsToBuy : packsToBuy.toFixed(2)} onChange={(e) => handlePacksChange(parseFloat(e.target.value) || 0, v.packQuantity)} className="w-full h-8 bg-slate-900 border border-slate-700 rounded text-center text-white"/></div>
                                    <div><label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Unidades</label><input type="number" value={unitsToBuy} onChange={(e) => handleUnitsChange(parseInt(e.target.value) || 0, v.packQuantity)} className="w-full h-8 bg-slate-900 border border-slate-700 rounded text-center text-white"/></div>
                                    <div className="col-span-2 pt-2 border-t border-slate-800 flex justify-between items-center"><span className="text-xs text-slate-500">Total Pedido:</span><p className="text-xl font-bold text-green-400">R$ {(packsToBuy * v.packPrice).toFixed(2)}</p></div>
                                </div>
                            );
                        })()}
                    </div>
                    <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-3"><button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 text-sm">Cancelar</button><button onClick={confirmAddToCart} className="bg-amber-600 px-6 py-2 rounded text-white font-bold shadow-lg"><ShoppingCart className="w-4 h-4 inline mr-2"/> Confirmar</button></div>
                </div>
            </div>
        )}
    </div>
  );
};

export default QuoteComparator;
