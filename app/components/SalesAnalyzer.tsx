
import React, { useState, useEffect } from 'react';
import { SalesRecord, ForecastItem } from '../types';
import { FileSpreadsheet, Play, TrendingUp, AlertCircle, Save, Link as LinkIcon, RefreshCw, Box } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';

interface SalesAnalyzerProps {
  setForecast: React.Dispatch<React.SetStateAction<ForecastItem[]>>;
  salesData: SalesRecord[];
  setSalesData: React.Dispatch<React.SetStateAction<SalesRecord[]>>;
  csvContent: string;
  setCsvContent: React.Dispatch<React.SetStateAction<string>>;
  // New props for config persistence & stock logic
  salesConfig: { historyDays: number; inflation: number; forecastDays: number; lastImportDate?: string };
  setSalesConfig: React.Dispatch<React.SetStateAction<{ historyDays: number; inflation: number; forecastDays: number; lastImportDate?: string }>>;
  salesUrl: string;
  setSalesUrl: React.Dispatch<React.SetStateAction<string>>;
}

const SalesAnalyzer: React.FC<SalesAnalyzerProps> = ({ 
    setForecast, 
    salesData, 
    setSalesData,
    csvContent,
    setCsvContent,
    salesConfig,
    setSalesConfig,
    salesUrl,
    setSalesUrl
}) => {
  const [historyDays, setHistoryDays] = useState<number>(salesConfig.historyDays || 60);
  const [forecastDays, setForecastDays] = useState<number>(salesConfig.forecastDays || 7);
  const [inflation, setInflation] = useState<number>(salesConfig.inflation || 10);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Stock Data State: Stores Qty AND Name to restore items that have no sales history
  const [stockData, setStockData] = useState<Map<string, { qty: number, name: string }>>(new Map());
  const [stockFileStatus, setStockFileStatus] = useState<string>('');

  // Update parent config when local changes
  useEffect(() => {
     setSalesConfig(prev => ({ ...prev, historyDays, forecastDays, inflation }));
  }, [historyDays, forecastDays, inflation, setSalesConfig]);

  const parseBrazilianNumber = (str: string) => {
      if (!str) return 0;
      let clean = str.replace(/["']/g, '').trim();
      if (!clean) return 0;
      if (/^\d+$/.test(clean)) return parseInt(clean, 10);
      if (clean.includes(',') && (!clean.includes('.') || clean.indexOf('.') < clean.indexOf(','))) {
          clean = clean.replace(/\./g, '').replace(',', '.');
      } else if (clean.includes('.') && clean.indexOf(',') < clean.indexOf('.')) {
          clean = clean.replace(/,/g, '');
      }
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
  };

  const processSalesCsv = (text: string) => {
    setErrorMsg('');
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) {
        setErrorMsg("Arquivo vazio ou inválido.");
        return;
    }

    const headerLine = lines[0];
    const separator = headerLine.includes(';') ? ';' : ',';
    const headers = headerLine.split(separator).map(h => h.trim().replace(/"/g, '').toLowerCase());

    const productIdx = headers.findIndex(h => h.includes('produto') || h.includes('descri'));
    const qtyIdx = headers.findIndex(h => h.includes('qtd') || h.includes('quantidade') || h.includes('vendas'));
    const skuIdx = headers.findIndex(h => h.includes('sku') || h.includes('cod') || h.includes('cód'));

    if (productIdx === -1) {
        setErrorMsg(`Não foi possível encontrar a coluna "Produto" no arquivo. Colunas identificadas: ${headers.join(', ')}`);
        return;
    }

    const records: SalesRecord[] = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(separator);
        if (parts.length <= productIdx) continue;

        const rawName = parts[productIdx]?.trim().replace(/"/g, '');
        const rawQty = qtyIdx !== -1 ? parts[qtyIdx] : '0';
        const rawSku = skuIdx !== -1 ? parts[skuIdx]?.trim().replace(/"/g, '') : '';

        if (rawName && /^(total|totais|geral|subtotal|resumo|troco)/i.test(rawName)) continue;

        if (rawName) {
            const qty = parseBrazilianNumber(rawQty);
            // MODIFICATION: Allow 0 qty items to be imported so the full catalog is available in Comparator
            records.push({
                sku: rawSku || rawName.substring(0, 10).toLowerCase(),
                productName: rawName,
                quantitySold: qty,
                date: new Date().toISOString()
            });
        }
    }

    setSalesData(records);
    setSalesConfig(prev => ({ ...prev, lastImportDate: new Date().toISOString() }));
    
    if (records.length === 0) {
        setErrorMsg("Nenhum registro válido processado. Verifique se as colunas estão corretas.");
    }
  };

  const processStockCsv = (text: string) => {
      try {
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) throw new Error("Arquivo inválido");
        
        const headerLine = lines[0];
        const separator = headerLine.includes(';') ? ';' : ',';
        const headers = headerLine.split(separator).map(h => h.trim().replace(/"/g, '').toLowerCase());
        
        const productIdx = headers.findIndex(h => h.includes('produto') || h.includes('descri'));
        const stockIdx = headers.findIndex(h => h.includes('saldo') || h.includes('estoque') || h.includes('qtd'));
        
        if (productIdx === -1 || stockIdx === -1) {
             throw new Error("Colunas 'Produto' e 'Estoque/Saldo' não encontradas.");
        }

        const newStockMap = new Map<string, { qty: number, name: string }>();
        let count = 0;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = line.split(separator);
            const name = parts[productIdx]?.trim().replace(/"/g, '');
            const qtyStr = parts[stockIdx];
            
            if (name) {
                const qty = parseBrazilianNumber(qtyStr);
                // Simplify name to serve as key (lowercase, remove weird chars)
                const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
                
                const existing = newStockMap.get(key);
                newStockMap.set(key, { 
                    qty: (existing?.qty || 0) + qty,
                    name: name // Store original name for restoration
                });
                count++;
            }
        }
        setStockData(newStockMap);
        setStockFileStatus(`${count} itens de estoque lidos.`);
      } catch (e: any) {
          setStockFileStatus(`Erro: ${e.message}`);
      }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvContent(text);
      processSalesCsv(text);
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const handleStockUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        processStockCsv(evt.target?.result as string);
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const handleUrlImport = async () => {
      if (!salesUrl) return;
      setIsProcessing(true);
      setErrorMsg('');
      try {
          let url = salesUrl;
          if (url.includes('docs.google.com') && !url.includes('output=')) {
              url = url.replace('/edit', '/pub?output=csv').replace('/pubhtml', '/pub?output=csv');
          }
          const res = await fetch(url);
          if (!res.ok) throw new Error("Erro ao baixar link");
          const text = await res.text();
          setCsvContent(text);
          processSalesCsv(text);
      } catch (e: any) {
          setErrorMsg(e.message || "Erro no link");
      } finally {
          setIsProcessing(false);
      }
  };

  const generateForecast = () => {
    setIsProcessing(true);
    
    // 1. Aggregate Sales Data
    const skuMap = new Map<string, {name: string, totalQty: number}>();
    salesData.forEach(record => {
        const key = record.productName; 
        const existing = skuMap.get(key);
        if (existing) {
            existing.totalQty += record.quantitySold;
        } else {
            skuMap.set(key, { name: record.productName, totalQty: record.quantitySold });
        }
    });

    const items: ForecastItem[] = [];
    const processedStockKeys = new Set<string>();
    
    // 2. Process items from Sales History (Primary)
    skuMap.forEach((val, key) => {
        const dailyAvg = val.totalQty / historyDays;
        const baseQty = Math.ceil(dailyAvg * forecastDays);
        const inflatedQty = Math.ceil(baseQty * (1 + (inflation / 100)));
        
        // Find current stock if available
        const simpleKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const stockInfo = stockData.get(simpleKey);
        const currentStock = stockInfo ? stockInfo.qty : 0;
        
        if (stockInfo) processedStockKeys.add(simpleKey);

        // INCLUDE CONDITION: If it sold OR if it exists in stock (even if 0 sales) OR if sales record exists (even if 0 qty)
        // This ensures the comparator shows everything known.
        items.push({
            sku: key.substring(0, 12).toLowerCase().replace(/\s/g, ''),
            name: val.name,
            baseQty,
            suggestedQty: inflatedQty,
            unit: 'un',
            inflationPercent: inflation,
            totalSold: val.totalQty,
            currentStock: currentStock
        });
    });

    // 3. Process items ONLY in Stock File (orphaned from Sales History)
    // This catches items with negative stock that haven't sold, or new items with stock but no sales.
    stockData.forEach((val, simpleKey) => {
        if (!processedStockKeys.has(simpleKey)) {
            // This item exists in Stock File but was NOT found in Sales File
            items.push({
                sku: simpleKey.substring(0, 12),
                name: val.name, // Use name from Stock File
                baseQty: 0,
                suggestedQty: 0, // No sales history, so suggestion is 0 (User must manually decide)
                unit: 'un',
                inflationPercent: inflation,
                totalSold: 0,
                currentStock: val.qty
            });
        }
    });

    setTimeout(() => {
        setForecast(items);
        setIsProcessing(false);
    }, 500);
  };

  const chartData = Array.from(salesData.reduce((acc, curr) => {
      acc.set(curr.productName, (acc.get(curr.productName) || 0) + curr.quantitySold);
      return acc;
  }, new Map<string, number>()))
  .map(([name, qty]) => {
      return { name: name.substring(0, 15), full: name, qty };
  })
  .sort((a, b) => b.qty - a.qty)
  .slice(0, 10);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-y-auto">
        {/* Settings Panel */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                <h2 className="text-xl font-bold text-amber-500 mb-4 flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5"/> Importar Vendas
                </h2>
                
                {/* 1. URL Import */}
                <div className="mb-4">
                    <label className="block text-sm text-slate-400 mb-2">Link Planilha Google (Publicado Web CSV)</label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={salesUrl}
                            onChange={(e) => setSalesUrl(e.target.value)}
                            placeholder="https://docs.google.com..."
                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-500"
                        />
                        <button onClick={handleUrlImport} disabled={!salesUrl} className="bg-amber-600 hover:bg-amber-700 text-white p-2 rounded disabled:opacity-50">
                            <LinkIcon className="w-4 h-4"/>
                        </button>
                    </div>
                </div>

                {/* 2. File Upload */}
                <div className="mb-4 border-t border-slate-700 pt-4">
                     <label className="block text-sm text-slate-400 mb-2">Ou Upload Arquivo CSV</label>
                     <input 
                        type="file" 
                        accept=".csv"
                        onChange={handleCsvUpload}
                        className="block w-full text-sm text-slate-300
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-sm file:font-semibold
                          file:bg-slate-700 file:text-white
                          hover:file:bg-slate-600
                        "
                     />
                     <p className="text-[10px] text-slate-500 mt-2">Colunas: "Produto" e "Quantidade"</p>
                </div>

                {/* 3. Stock Report Upload */}
                <div className="mb-4 border-t border-slate-700 pt-4 bg-slate-900/30 p-3 rounded">
                     <label className="block text-sm font-bold text-blue-400 mb-2 flex items-center gap-2">
                         <Box className="w-4 h-4"/> Relatório de Estoque Atual
                     </label>
                     <input 
                        type="file" 
                        accept=".csv"
                        onChange={handleStockUpload}
                        className="block w-full text-sm text-slate-300
                          file:mr-4 file:py-1 file:px-3
                          file:rounded-full file:border-0
                          file:text-xs file:font-semibold
                          file:bg-blue-900 file:text-blue-200
                          hover:file:bg-blue-800
                        "
                     />
                     <p className="text-[10px] text-slate-500 mt-2">Colunas: "Produto" e "Saldo/Estoque". Opcional.</p>
                     {stockFileStatus && <p className="text-xs text-green-400 mt-1">{stockFileStatus}</p>}
                </div>

                {errorMsg && (
                    <div className="bg-red-900/50 p-3 rounded text-sm text-red-200 border border-red-800 mb-4 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4"/> {errorMsg}
                    </div>
                )}

                {salesData.length > 0 && (
                    <div className="bg-slate-900/50 p-3 rounded text-sm text-green-400 border border-green-900 mb-4">
                        {salesData.length} registros de venda importados.
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Período de Histórico (Dias)</label>
                        <input 
                            type="number" 
                            value={historyDays}
                            onChange={(e) => setHistoryDays(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-amber-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Meta de Estoque (Dias)</label>
                        <input 
                            type="number" 
                            value={forecastDays}
                            onChange={(e) => setForecastDays(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-amber-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Margem de Segurança (%)</label>
                        <div className="flex items-center gap-2">
                             <input 
                                type="range" 
                                min="0" 
                                max="100" 
                                value={inflation}
                                onChange={(e) => setInflation(Number(e.target.value))}
                                className="flex-1 accent-amber-500"
                            />
                            <span className="bg-slate-900 px-2 py-1 rounded w-12 text-center text-sm">{inflation}%</span>
                        </div>
                    </div>

                    <button 
                        onClick={generateForecast}
                        disabled={salesData.length === 0 || isProcessing}
                        className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold py-3 rounded shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isProcessing ? 'Calculando...' : <><Play className="w-4 h-4" /> Gerar Simulação</>}
                    </button>
                </div>
            </div>
        </div>

        {/* Visualization & Result Panel */}
        <div className="lg:col-span-2 bg-slate-800 p-6 rounded-lg border border-slate-700 flex flex-col">
            {salesData.length > 0 ? (
                <>
                    <h3 className="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4"/> Top 10 Produtos Mais Vendidos</h3>
                    <div style={{ width: '100%', height: 400 }}>
                        <ResponsiveContainer>
                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis 
                                    dataKey="name" 
                                    tick={{fill: '#94a3b8', fontSize: 11}} 
                                    interval={0} 
                                    angle={-45} 
                                    textAnchor="end"
                                    height={70} 
                                />
                                <YAxis tick={{fill: '#94a3b8'}} />
                                <Tooltip 
                                    cursor={{fill: '#334155', opacity: 0.4}}
                                    contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9'}}
                                    itemStyle={{color: '#fbbf24'}}
                                    formatter={(value: number) => [`${value} un`, 'Vendas']}
                                />
                                <Bar dataKey="qty" fill="#fbbf24" radius={[4, 4, 0, 0]}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index < 3 ? '#f59e0b' : '#475569'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    <FileSpreadsheet className="w-16 h-16 mb-4 opacity-20" />
                    <p>Faça upload do relatório de vendas para ver a análise.</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default SalesAnalyzer;
