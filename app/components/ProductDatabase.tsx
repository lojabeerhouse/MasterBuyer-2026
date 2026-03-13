
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MasterProduct } from '../types';
import { Database, Search, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Link as LinkIcon, RefreshCw, Upload, CircleHelp, X, Download, CheckSquare, Square, Settings2, Image, Pencil, Save, Ban, Sparkles, Send, XCircle, Bell, CheckCircle2 } from 'lucide-react';
import { interpretBulkEditCommand, batchSuggestNCM } from '../services/geminiService';

interface ProductDatabaseProps {
  masterProducts: MasterProduct[];
  setMasterProducts: React.Dispatch<React.SetStateAction<MasterProduct[]>>;
  sheetUrl: string;
  setSheetUrl: React.Dispatch<React.SetStateAction<string>>;
}

// Internal interface to handle the temporary state before name resolution
interface TempProduct extends MasterProduct {
    rawParentSku?: string;
}

type SortConfig = {
    key: keyof MasterProduct | 'margin';
    direction: 'asc' | 'desc';
} | null;

interface ToastNotification {
    id: string;
    message: string;
    type: 'success' | 'info' | 'error';
    visible: boolean; // Controls the fade out
}

// Column Definition Structure
interface ColumnDef {
    id: keyof MasterProduct | 'margin';
    label: string;
    locked?: boolean; // If true, cannot be hidden (e.g. SKU, Name)
    type?: 'text' | 'number' | 'currency' | 'percent' | 'image' | 'link';
    align?: 'left' | 'center' | 'right';
    editable?: boolean;
    decimalPlaces?: number; // New: control precision
}

// Definition of headers specifically for Bling Export
const BLING_HEADERS_STRING = "ID;Código;Descrição;Unidade;NCM;Origem;Preço;Valor IPI fixo;Observações;Situação;Estoque;Preço de custo;Cód. no fornecedor;Fornecedor;Localização;Estoque máximo;Estoque mínimo;Peso líquido (Kg);Peso bruto (Kg);GTIN/EAN;GTIN/EAN da Embalagem;Largura do produto;Altura do Produto;Profundidade do produto;Data Validade;Descrição do Produto no Fornecedor;Descrição Complementar;Itens p/ caixa;Produto Variação;Tipo Produção;Classe de enquadramento do IPI;Código na Lista de Serviços;Tipo do item;Grupo de Tags/Tags;Tributos;Código Pai;Código Integração;Grupo de produtos;Marca;CEST;Volumes;Descrição Curta;Cross-Docking;URL Imagens Externas;Link Externo;Meses Garantia no Fornecedor;Clonar dados do pai;Condição do Produto;Frete Grátis;Número FCI;Vídeo;Departamento;Unidade de Medida;Preço de Compra;Valor base ICMS ST para retenção;Valor ICMS ST para retenção;Valor ICMS próprio do substituto;Categoria do produto;Informações Adicionais";

const ALL_COLUMNS: ColumnDef[] = [
    { id: 'id', label: 'ID', type: 'text', align: 'center', editable: false },
    { id: 'sku', label: 'Código (SKU)', locked: true, type: 'text', align: 'left', editable: true },
    { id: 'name', label: 'Produto', locked: true, type: 'text', align: 'left', editable: true },
    { id: 'unit', label: 'Un.', type: 'text', align: 'center', editable: true },
    { id: 'ncm', label: 'NCM', type: 'text', align: 'left', editable: true },
    { id: 'priceCost', label: 'Custo', type: 'currency', align: 'right', editable: true },
    { id: 'priceSell', label: 'Venda', type: 'currency', align: 'right', editable: true },
    { id: 'margin', label: 'Margem', type: 'percent', align: 'right', editable: false },
    { id: 'stock', label: 'Estoque', type: 'number', align: 'right', editable: true },
    { id: 'supplier', label: 'Fornecedor', type: 'text', align: 'left', editable: true },
    { id: 'brand', label: 'Marca', type: 'text', align: 'left', editable: true },
    { id: 'category', label: 'Categoria', type: 'text', align: 'left', editable: true },
    { id: 'productGroup', label: 'Grupo Produtos', type: 'text', align: 'left', editable: true },
    { id: 'tags', label: 'Tags', type: 'text', align: 'left', editable: true },
    { id: 'location', label: 'Local.', type: 'text', align: 'left', editable: true },
    { id: 'minStock', label: 'Est. Mín', type: 'number', align: 'right', editable: true },
    { id: 'maxStock', label: 'Est. Máx', type: 'number', align: 'right', editable: true },
    { id: 'ean', label: 'EAN/GTIN', type: 'text', align: 'left', editable: true },
    { id: 'netWeight', label: 'Peso Líq.', type: 'number', align: 'right', editable: true, decimalPlaces: 3 },
    { id: 'grossWeight', label: 'Peso Bruto', type: 'number', align: 'right', editable: true, decimalPlaces: 3 },
    { id: 'width', label: 'Larg.', type: 'number', align: 'right', editable: true },
    { id: 'height', label: 'Alt.', type: 'number', align: 'right', editable: true },
    { id: 'depth', label: 'Prof.', type: 'number', align: 'right', editable: true },
    { id: 'origin', label: 'Origem', type: 'text', align: 'left', editable: true },
    { id: 'status', label: 'Situação', type: 'text', align: 'center', editable: true },
    { id: 'observations', label: 'Obs', type: 'text', align: 'left', editable: true },
    { id: 'expiryDate', label: 'Validade', type: 'text', align: 'center', editable: true },
    { id: 'image', label: 'Img', type: 'image', align: 'center', editable: true },
    { id: 'externalLink', label: 'Link', type: 'link', align: 'center', editable: true },
];

// Default visible columns matches the previous version
const DEFAULT_VISIBLE_COLUMNS: (keyof MasterProduct | 'margin')[] = [
    'sku', 'name', 'supplier', 'stock', 'priceCost', 'priceSell', 'margin'
];

const SortIcon = ({ column, sortConfig }: { column: keyof MasterProduct | 'margin', sortConfig: SortConfig }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />;
};

const ProductDatabase: React.FC<ProductDatabaseProps> = ({ masterProducts = [], setMasterProducts, sheetUrl, setSheetUrl }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [inputUrl, setInputUrl] = useState(sheetUrl);
  const [showHelp, setShowHelp] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // AI Edit State
  const [aiCommand, setAiCommand] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  
  // Toasts
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Initialize from LocalStorage or Default
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<keyof MasterProduct | 'margin'>>(() => {
      try {
          const saved = localStorage.getItem('beerhouse_db_columns');
          if (saved) return new Set(JSON.parse(saved));
      } catch (e) {}
      return new Set(DEFAULT_VISIBLE_COLUMNS);
  });

  const selectorRef = useRef<HTMLDivElement>(null);

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Save columns preference
  useEffect(() => {
      localStorage.setItem('beerhouse_db_columns', JSON.stringify(Array.from(visibleColumnIds)));
  }, [visibleColumnIds]);

  // Click outside to close selector
  useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
          if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
              setShowColumnSelector(false);
          }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load from URL on mount if present and DB is empty
  useEffect(() => {
      if (sheetUrl && Array.isArray(masterProducts) && masterProducts.length === 0) {
          fetchFromUrl(sheetUrl, true);
      }
  }, []);

  const addToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
      const id = crypto.randomUUID();
      setToasts(prev => [...prev, { id, message, type, visible: true }]);

      // Start fade out after 5s
      setTimeout(() => {
          setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
      }, 5000);

      // Remove from DOM after 10s
      setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
      }, 10000);
  };

  const removeToast = (id: string) => {
      setToasts(prev => prev.filter(t => t.id !== id));
  };

  const toggleColumn = (colId: keyof MasterProduct | 'margin') => {
      const colDef = ALL_COLUMNS.find(c => c.id === colId);
      if (colDef?.locked) return; // Prevent hiding locked columns

      const newSet = new Set(visibleColumnIds);
      if (newSet.has(colId)) newSet.delete(colId);
      else newSet.add(colId);
      setVisibleColumnIds(newSet);
  };

  const handleUpdateProduct = (id: string, field: keyof MasterProduct, value: string | number) => {
      setMasterProducts(prev => prev.map(p => {
          if (p.id === id) {
              return { ...p, [field]: value };
          }
          return p;
      }));
      // Add quick notification for manual edits (debounce could be good here but keeping it simple)
      // We don't want to spam toast on every keystroke, so only on blur essentially (which is how the input works now mostly)
      // Actually, since the input `onChange` updates state immediately, this would spam.
      // For manual edits via input, we might skip the toast or use `onBlur`.
      // The current `renderCell` uses `onChange`.
      // Let's NOT toast on every keystroke of manual edit, only AI/Bulk actions or specific save actions.
  };

  // Safe fallback for ID generation
  const generateId = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          return crypto.randomUUID();
      }
      return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  const parseBrazilianNumber = (str: string) => {
      if (!str) return 0;
      const cleanStr = str.replace(/[^\d.,-]/g, '').trim();
      if (!cleanStr) return 0;

      // PT-BR format (1.000,00)
      if (cleanStr.includes(',') && cleanStr.indexOf('.') !== -1 && cleanStr.indexOf('.') < cleanStr.indexOf(',')) {
          return parseFloat(cleanStr.replace(/\./g, '').replace(',', '.'));
      }
      // US Format (1,000.00)
      if (cleanStr.includes(',') && cleanStr.indexOf('.') !== -1 && cleanStr.indexOf(',') < cleanStr.indexOf('.')) {
          return parseFloat(cleanStr.replace(/,/g, ''));
      }
      // Simple PT-BR (10,00)
      if (cleanStr.includes(',')) {
          return parseFloat(cleanStr.replace('.', '').replace(',', '.'));
      }
      const num = parseFloat(cleanStr);
      return isNaN(num) ? 0 : num;
  };

  const processCsv = (text: string) => {
      if (text.trim().toLowerCase().startsWith('<!doctype html') || text.includes('<html')) {
          throw new Error("O link retornou HTML. Certifique-se de usar o link de 'Publicar na Web' > CSV/TSV.");
      }

      const lines = text.split(/\r\n|\r|\n/);
      if (lines.length < 2) {
          const preview = text.length > 50 ? text.substring(0, 50) + "..." : text;
          throw new Error(`Arquivo vazio ou com formato de linhas inválido. Início: "${preview}"`);
      }

      const headerLine = lines[0];
      const tabCount = (headerLine.match(/\t/g) || []).length;
      const semicolonCount = (headerLine.match(/;/g) || []).length;
      const commaCount = (headerLine.match(/,/g) || []).length;
      
      let separator = ',';
      if (tabCount > commaCount && tabCount > semicolonCount) separator = '\t';
      else if (semicolonCount >= commaCount) separator = ';';

      console.log(`Detected separator: '${separator === '\t' ? 'TAB' : separator}'`);

      const headers = headerLine.split(separator).map(h => h.trim().replace(/^"(.*)"$/, '$1').toLowerCase());
      
      const getIndex = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h === k || h.includes(k)));

      // --- MAPPING LOGIC START ---
      const map = {
          id: getIndex(['id']),
          sku: getIndex(['sku', 'codigo', 'código', 'cod']),
          name: getIndex(['descri', 'nome', 'produto']),
          unit: getIndex(['unid', 'unidade']),
          ncm: getIndex(['ncm']),
          origin: getIndex(['origem']),
          priceSell: getIndex(['preço', 'preco', 'venda', 'saida']),
          priceCost: getIndex(['custo', 'compra', 'preço de custo']),
          stock: getIndex(['estoque', 'qtd', 'saldo']),
          
          // STRICTER SUPPLIER CHECK: Avoid "cod. no fornecedor" matching "fornecedor"
          supplier: headers.findIndex(h => h === 'fornecedor' || (h.includes('fornecedor') && !h.includes('cod') && !h.includes('cód'))),
          
          ean: getIndex(['ean', 'gtin', 'barras']),
          
          // New Fields
          brand: getIndex(['marca']),
          category: getIndex(['categoria do produto']), // Updated Mapping: Column BF
          tags: getIndex(['grupo de tags', 'tags', 'tag']), // Updated Mapping: Old Category
          productGroup: getIndex(['grupo de produtos', 'grupo produtos']), // New Mapping: Column AL
          
          department: getIndex(['departamento']),
          netWeight: getIndex(['peso líquido', 'peso liq']),
          grossWeight: getIndex(['peso bruto']),
          minStock: getIndex(['estoque mínimo', 'est. min', 'minimo']),
          maxStock: getIndex(['estoque máximo', 'est. max', 'maximo']),
          width: getIndex(['largura']),
          height: getIndex(['altura']),
          depth: getIndex(['profundidade', 'comprimento']),
          expiryDate: getIndex(['validade', 'data validade']),
          image: getIndex(['imagem', 'url imagem', 'foto']),
          externalLink: getIndex(['link', 'externo', 'url']),
          observations: getIndex(['obs', 'observacao', 'observação']),
          status: getIndex(['situacao', 'situação', 'status']),
          location: getIndex(['localizacao', 'localização', 'local']),
          
          parent: getIndex(['pai', 'grade', 'agrupador', 'código pai'])
      };

      if (map.name === -1) {
          throw new Error(`Coluna de 'Descrição/Produto' não encontrada. Colunas lidas: ${headers.join(' | ')}`);
      }

      const tempProducts: TempProduct[] = [];
      let successCount = 0;
      
      for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          let cols: string[] = [];
          if (separator === ',') {
              const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
              if (matches) cols = matches.map(c => c.replace(/^"(.*)"$/, '$1').trim());
              else cols = line.split(separator).map(c => c.trim().replace(/^"(.*)"$/, '$1'));
          } else {
              cols = line.split(separator).map(c => c.trim().replace(/^"(.*)"$/, '$1'));
          }

          if (cols.length <= map.name) continue;

          const name = cols[map.name];
          if (!name) continue;

          let parentSku = '';
          if (map.parent !== -1 && cols[map.parent]) {
              parentSku = cols[map.parent].trim();
          } else if (cols.length > 35) {
              const colAJ = cols[35]?.trim();
              if (colAJ) parentSku = colAJ;
          }

          const getVal = (idx: number) => (idx !== -1 && cols[idx] ? cols[idx].trim() : '');
          const getNum = (idx: number) => (idx !== -1 ? parseBrazilianNumber(cols[idx]) : 0);

          tempProducts.push({
              id: getVal(map.id) || generateId(),
              sku: getVal(map.sku) || 'S/N',
              name: name,
              unit: getVal(map.unit) || 'UN',
              ncm: getVal(map.ncm),
              priceSell: getNum(map.priceSell),
              priceCost: getNum(map.priceCost),
              stock: getNum(map.stock),
              supplier: getVal(map.supplier),
              ean: getVal(map.ean),
              
              // New Fields
              brand: getVal(map.brand),
              category: getVal(map.category), // Real Category
              tags: getVal(map.tags), // Tags
              productGroup: getVal(map.productGroup), // Tax Group
              
              department: getVal(map.department),
              origin: getVal(map.origin),
              status: getVal(map.status),
              observations: getVal(map.observations),
              image: getVal(map.image),
              externalLink: getVal(map.externalLink),
              expiryDate: getVal(map.expiryDate),
              
              netWeight: getNum(map.netWeight),
              grossWeight: getNum(map.grossWeight),
              minStock: getNum(map.minStock),
              maxStock: getNum(map.maxStock),
              width: getNum(map.width),
              height: getNum(map.height),
              depth: getNum(map.depth),
              location: getVal(map.location),

              rawParentSku: parentSku
          });
          successCount++;
      }

      if (successCount === 0) throw new Error("Nenhum produto válido importado.");

      // Resolve Parents
      const skuToNameMap = new Map<string, string>();
      tempProducts.forEach(p => {
          if (p.sku && p.sku !== 'S/N') skuToNameMap.set(p.sku.trim(), p.name);
      });

      const finalProducts: MasterProduct[] = tempProducts.map(p => {
          if (p.rawParentSku && skuToNameMap.has(p.rawParentSku)) {
              return { ...p, name: `${skuToNameMap.get(p.rawParentSku)} ${p.name}` };
          }
          return p;
      });

      setMasterProducts(finalProducts);
      setErrorMsg("");
      addToast(`${finalProducts.length} produtos importados com sucesso!`, 'success');
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try { processCsv(evt.target?.result as string); } 
      catch (err: any) { setErrorMsg(err.message || 'Erro ao processar arquivo.'); } 
      finally { setIsProcessing(false); }
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const fetchFromUrl = async (rawUrl: string, isAutoLoad = false) => {
      let url = rawUrl.trim();
      if (!url) return;
      if (!url.startsWith('http')) url = 'https://' + url;

      setIsProcessing(true);
      setErrorMsg('');

      if (url.includes('docs.google.com')) {
           if (url.includes('/edit') || url.includes('/share') || !url.includes('/d/e/')) {
               setIsProcessing(false);
               if (!isAutoLoad) {
                    setErrorMsg("Link incorreto! Use 'Publicar na Web'. Clique em AJUDA.");
                    setShowHelp(true);
               }
               return;
           }
           let targetUrl = url.replace('/pubhtml', '/pub');
           if (!targetUrl.includes('output=')) {
               const separator = targetUrl.includes('?') ? '&' : '?';
               targetUrl = `${targetUrl}${separator}output=tsv`;
           }
           url = targetUrl;
      }

      try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
          const text = await response.text();
          processCsv(text);
          setSheetUrl(rawUrl); 
      } catch (e: any) {
          let msg = e.message;
          if (msg.includes('Failed to fetch')) {
              msg = "Erro de conexão (CORS). Use o link 'Publicar na Web' > CSV/TSV.";
              if (!isAutoLoad) setShowHelp(true);
          }
          setErrorMsg(msg);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleSort = (key: keyof MasterProduct | 'margin') => {
      setSortConfig(current => {
          if (current?.key === key) {
              return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
          }
          return { key, direction: 'desc' };
      });
  };

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const toggleSelectAll = (visibleProducts: MasterProduct[]) => {
      const allVisibleIds = visibleProducts.map(p => p.id);
      const allSelected = allVisibleIds.every(id => selectedIds.has(id));
      const newSet = new Set(selectedIds);
      if (allSelected) allVisibleIds.forEach(id => newSet.delete(id));
      else allVisibleIds.forEach(id => newSet.add(id));
      setSelectedIds(newSet);
  };

  const formatForBling = (val: any) => {
      if (val === undefined || val === null) return '';
      if (typeof val === 'number') return val.toFixed(2).replace('.', ',');
      return String(val).replace(/;/g, ','); // Avoid breaking CSV structure
  };

  const handleExportBling = () => {
      if (selectedIds.size === 0) return;
      
      const productsToExport = masterProducts.filter(p => selectedIds.has(p.id));
      const headers = BLING_HEADERS_STRING.split(';');

      const rows = productsToExport.map(p => {
          return headers.map(header => {
              // Exact strict mapping based on Bling Column Names
              switch(header) {
                  case 'ID': return p.id;
                  case 'Código': return p.sku;
                  case 'Descrição': return p.name;
                  case 'Unidade': return p.unit;
                  case 'NCM': return p.ncm;
                  case 'Origem': return p.origin;
                  case 'Preço': return formatForBling(p.priceSell);
                  case 'Valor IPI fixo': return formatForBling(p.ipiFixed);
                  case 'Observações': return p.observations;
                  case 'Situação': return p.status;
                  case 'Estoque': return formatForBling(p.stock);
                  case 'Preço de custo': return formatForBling(p.priceCost);
                  // 'Cód. no fornecedor' skipped
                  case 'Fornecedor': return p.supplier;
                  case 'Localização': return p.location;
                  case 'Estoque máximo': return formatForBling(p.maxStock);
                  case 'Estoque mínimo': return formatForBling(p.minStock);
                  case 'Peso líquido (Kg)': return p.netWeight ? p.netWeight.toFixed(3).replace('.', ',') : '';
                  case 'Peso bruto (Kg)': return p.grossWeight ? p.grossWeight.toFixed(3).replace('.', ',') : '';
                  case 'GTIN/EAN': return p.ean;
                  case 'GTIN/EAN da Embalagem': return p.gtinPackaging;
                  case 'Largura do produto': return formatForBling(p.width);
                  case 'Altura do Produto': return formatForBling(p.height);
                  case 'Profundidade do produto': return formatForBling(p.depth);
                  case 'Data Validade': return p.expiryDate;
                  // 'Descrição do Produto no Fornecedor' skipped
                  // 'Descrição Complementar' skipped
                  // 'Itens p/ caixa' skipped
                  // 'Produto Variação' skipped
                  case 'Tipo Produção': return p.productionType;
                  // 'Classe de enquadramento do IPI' skipped
                  // 'Código na Lista de Serviços' skipped
                  // 'Tipo do item' skipped
                  case 'Grupo de Tags/Tags': return p.tags; // Mapped
                  // 'Tributos' skipped
                  // 'Código Pai' skipped (complex logic omitted for simplicity or could be mapped)
                  // 'Código Integração' skipped
                  case 'Grupo de produtos': return p.productGroup; // Mapped
                  case 'Marca': return p.brand;
                  // 'CEST' skipped
                  // 'Volumes' skipped
                  // 'Descrição Curta' skipped
                  case 'Cross-Docking': return formatForBling(p.crossDocking);
                  case 'URL Imagens Externas': return p.image;
                  case 'Link Externo': return p.externalLink;
                  // 'Meses Garantia no Fornecedor' skipped
                  // 'Clonar dados do pai' skipped
                  case 'Condição do Produto': return p.condition;
                  case 'Frete Grátis': return p.freeShipping;
                  // 'Número FCI' skipped
                  // 'Vídeo' skipped
                  case 'Departamento': return p.department;
                  // 'Unidade de Medida' skipped
                  case 'Preço de Compra': return formatForBling(p.priceCost); // Assuming same as cost
                  // 'Valor base ICMS ST para retenção' skipped
                  // 'Valor ICMS ST para retenção' skipped
                  // 'Valor ICMS próprio do substituto' skipped
                  case 'Categoria do produto': return p.category;
                  case 'Informações Adicionais': return '';
                  default: return ''; // Empty string for unmapped columns to maintain structure
              }
          }).join(';');
      }).join('\n');

      const csvContent = "data:text/csv;charset=utf-8," + encodeURI(BLING_HEADERS_STRING + "\n" + rows);
      const link = document.createElement("a");
      link.setAttribute("href", csvContent);
      link.setAttribute("download", `exportacao_bling_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      addToast(`Exportação do Bling iniciada para ${productsToExport.length} itens.`, 'info');
  };

  const handleAiBulkEdit = async () => {
      if (!aiCommand.trim() || selectedIds.size === 0) return;
      
      setIsAiProcessing(true);
      setErrorMsg('');

      try {
          const result = await interpretBulkEditCommand(aiCommand);
          
          if (result.error || !result.field) {
              setErrorMsg(result.error || "A IA não conseguiu entender o comando.");
              setIsAiProcessing(false);
              return;
          }

          // SPECIAL HANDLING FOR AUTO_NCM
          if (result.field === 'ncm' && result.value === 'AUTO_GENERATE') {
              const itemsToLookup = masterProducts
                  .filter(p => selectedIds.has(p.id))
                  .map(p => ({ id: p.id, name: p.name }));
              
              // Call specialized Batch NCM service
              const ncmResults = await batchSuggestNCM(itemsToLookup);
              const ncmMap = new Map(ncmResults.map(r => [r.id, r.ncm]));

              setMasterProducts(prev => prev.map(p => {
                  if (ncmMap.has(p.id)) {
                      return { ...p, ncm: ncmMap.get(p.id)! };
                  }
                  return p;
              }));
              
              addToast(`NCMs encontrados e atualizados para ${ncmResults.length} produtos!`, 'success');

          } else {
              // STANDARD FIELD UPDATE
              setMasterProducts(prev => prev.map(p => {
                  if (selectedIds.has(p.id)) {
                      return { ...p, [result.field!]: result.value };
                  }
                  return p;
              }));
              addToast(`Campo '${result.field}' atualizado em ${selectedIds.size} produtos!`, 'success');
          }

          setAiCommand('');

      } catch (e) {
          setErrorMsg("Erro ao processar comando da IA.");
          addToast("Erro ao processar comando.", "error");
      } finally {
          setIsAiProcessing(false);
      }
  };

  // Rendering Helper
  const renderCell = (product: MasterProduct, colId: keyof MasterProduct | 'margin', isEditing: boolean) => {
      const def = ALL_COLUMNS.find(c => c.id === colId);
      
      // If Editing is ON and the column is editable, SHOW INPUT
      // This logic is placed FIRST to ensure special types like 'image' and 'link' also get an input field in Edit Mode
      if (isEditing && def?.editable) {
          const val = product[colId as keyof MasterProduct];
          return (
              <input 
                  type={def.type === 'number' || def.type === 'currency' ? 'number' : 'text'}
                  value={val === undefined ? '' : String(val)}
                  step={def.decimalPlaces ? `0.${'0'.repeat(def.decimalPlaces - 1)}1` : 'any'}
                  onChange={(e) => {
                      const newValue = (def.type === 'number' || def.type === 'currency') 
                          ? parseFloat(e.target.value) 
                          : e.target.value;
                      handleUpdateProduct(product.id, colId as keyof MasterProduct, newValue);
                  }}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-1 text-sm text-white focus:border-indigo-500 focus:outline-none h-6"
                  placeholder={def.type === 'image' ? 'URL da imagem...' : ''}
              />
          );
      }

      // Display logic for View Mode
      if (colId === 'margin') {
          const margin = product.priceSell > 0 ? ((product.priceSell - product.priceCost) / product.priceSell) * 100 : 0;
          return (
             <span className={`text-xs px-1.5 py-0.5 rounded ${margin > 30 ? 'bg-green-900/30 text-green-400' : margin > 0 ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400'}`}>
                {margin.toFixed(1)}%
             </span>
          );
      }
      if (colId === 'image') {
          return product.image ? <a href={product.image} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-white flex items-center justify-center"><Image className="w-4 h-4"/></a> : <span className="text-slate-600 text-center block">-</span>;
      }
      if (colId === 'externalLink') {
          return product.externalLink ? <a href={product.externalLink} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-white flex items-center justify-center"><LinkIcon className="w-4 h-4"/></a> : <span className="text-slate-600 text-center block">-</span>;
      }

      const val = product[colId];
      if (typeof val === 'number') {
          // Check column definition for formatting (Currency vs Number)
          if (def?.type === 'currency') return `R$ ${val.toFixed(2)}`;
          if (def?.decimalPlaces) return val.toFixed(def.decimalPlaces).replace('.', ',');
          return val.toLocaleString('pt-BR');
      }
      return val || '-';
  };

  const filteredAndSortedProducts = useMemo(() => {
      let result = masterProducts;
      if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          result = result.filter(p => 
              (p.name && p.name.toLowerCase().includes(lower)) || 
              (p.sku && p.sku.toLowerCase().includes(lower)) ||
              (p.ean && p.ean.includes(lower))
          );
      }
      if (sortConfig) {
          result = [...result].sort((a, b) => {
              if (sortConfig.key === 'margin') {
                  const marginA = a.priceSell > 0 ? ((a.priceSell - a.priceCost) / a.priceSell) : -999;
                  const marginB = b.priceSell > 0 ? ((b.priceSell - b.priceCost) / b.priceSell) : -999;
                  return sortConfig.direction === 'asc' ? marginA - marginB : marginB - marginA;
              }
              const valA = a[sortConfig.key] || '';
              const valB = b[sortConfig.key] || '';
              if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
              if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }
      return result.slice(0, 200);
  }, [masterProducts, searchTerm, sortConfig]);

  const totalStockValue = masterProducts.reduce((acc, curr) => acc + (curr.priceCost * curr.stock), 0);
  const isAllVisibleSelected = filteredAndSortedProducts.length > 0 && filteredAndSortedProducts.every(p => selectedIds.has(p.id));

  // Get active columns objects
  const activeColumns = ALL_COLUMNS.filter(c => visibleColumnIds.has(c.id));

  return (
    <div className="flex flex-col h-full space-y-6 relative">
        {/* TOAST CONTAINER */}
        <div className="fixed bottom-4 right-4 z-[150] flex flex-col gap-2 pointer-events-none">
            {toasts.map(toast => (
                <div 
                    key={toast.id}
                    className={`pointer-events-auto bg-slate-800 border-l-4 rounded shadow-2xl p-4 w-80 transform transition-all duration-[5000ms] ease-out flex items-start gap-3
                        ${toast.type === 'success' ? 'border-green-500' : toast.type === 'error' ? 'border-red-500' : 'border-blue-500'}
                        ${toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
                    `}
                >
                    <div className="mt-0.5">
                        {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500"/>}
                        {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500"/>}
                        {toast.type === 'info' && <Bell className="w-5 h-5 text-blue-500"/>}
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-slate-200">{toast.message}</p>
                    </div>
                    <button onClick={() => removeToast(toast.id)} className="text-slate-500 hover:text-white">
                        <X className="w-4 h-4"/>
                    </button>
                </div>
            ))}
        </div>

        {/* Header Panel */}
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Database className="w-6 h-6 text-indigo-500"/> Banco de Produtos
                    </h2>
                    <p className="text-slate-400 text-sm">Gerenciamento mestre de produtos e cadastro.</p>
                </div>
                <div className="flex gap-4 text-right bg-slate-900 p-2 rounded border border-slate-700">
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Itens</p>
                        <p className="text-lg font-bold text-white">{masterProducts.length.toLocaleString()}</p>
                    </div>
                    <div className="w-px bg-slate-700"></div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Estoque (R$)</p>
                        <p className="text-lg font-bold text-green-400">R$ {totalStockValue.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                    </div>
                </div>
            </div>

            {/* Input / Upload Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900 p-4 rounded border border-slate-700 flex flex-col gap-2 relative">
                    <label className="text-xs font-bold text-indigo-400 flex items-center justify-between gap-1">
                        <span className="flex items-center gap-1"><LinkIcon className="w-3 h-3"/> Conectar Planilha Google</span>
                        <button onClick={() => setShowHelp(!showHelp)} className="flex items-center gap-1 text-[10px] bg-slate-800 px-2 py-0.5 rounded border border-slate-600 hover:text-white transition-colors">
                            <CircleHelp className="w-3 h-3"/> {showHelp ? 'Ocultar Ajuda' : 'Ajuda'}
                        </button>
                    </label>

                    {showHelp && (
                        <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded text-sm text-slate-300 animate-in slide-in-from-top-2">
                            <h4 className="font-bold text-white mb-2 text-xs uppercase flex items-center justify-between">
                                Passo a Passo (Obrigatório)
                                <button onClick={() => setShowHelp(false)}><X className="w-4 h-4 text-slate-400 hover:text-white"/></button>
                            </h4>
                            <ol className="list-decimal pl-4 space-y-1 text-xs">
                                <li>No Google Sheets, vá em <strong>Arquivo {'>'} Compartilhar {'>'} Publicar na Web</strong>.</li>
                                <li>Mude "Página da Web" para <strong>"Valores separados por TABULAÇÃO (.tsv)"</strong> ou CSV.</li>
                                <li>Clique em <strong>Publicar</strong> e copie o link (deve conter <code>/d/e/</code>).</li>
                                <li>Cole o link abaixo.</li>
                            </ol>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="Link 'Publicado na Web'..." 
                            value={inputUrl}
                            onChange={(e) => setInputUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchFromUrl(inputUrl)}
                            className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        />
                        <button 
                            onClick={() => fetchFromUrl(inputUrl)}
                            disabled={isProcessing}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                <div className="bg-slate-900 p-4 rounded border border-slate-700 border-dashed flex flex-col justify-center gap-2">
                    <label className="text-xs font-bold text-slate-400 flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
                        <Upload className="w-3 h-3"/> Upload Arquivo Local
                        <input type="file" accept=".csv, .tsv, .txt" onChange={handleCsvUpload} disabled={isProcessing} className="hidden" />
                    </label>
                    <p className="text-[10px] text-slate-500">Suporta TSV ou CSV.</p>
                </div>
            </div>
            
            {errorMsg && (
                <div className="p-3 bg-red-900/30 text-red-300 rounded border border-red-900 flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4"/> {errorMsg}
                </div>
            )}
        </div>

        {/* Table Panel */}
        <div className="flex-1 bg-slate-800 rounded-lg border border-slate-700 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/50">
                <div className="relative w-full md:max-w-md">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="Buscar por nome, SKU, EAN, Marca..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded pl-10 pr-4 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                </div>

                <div className="flex items-center gap-2 relative">
                     {/* Edit Mode Toggle */}
                     <button
                        onClick={() => setIsEditMode(!isEditMode)}
                        className={`flex items-center gap-2 px-3 py-2 rounded text-sm border transition-colors ${isEditMode ? 'bg-amber-600 border-amber-500 text-white shadow-lg animate-pulse' : 'bg-slate-700 hover:bg-slate-600 border-slate-600 text-white'}`}
                        title={isEditMode ? "Sair do Modo de Edição" : "Entrar no Modo de Edição"}
                     >
                        {isEditMode ? <Save className="w-4 h-4" /> : <Pencil className="w-4 h-4" />} 
                        <span className="hidden sm:inline">{isEditMode ? 'Salvar Edições' : 'Modo Edição'}</span>
                     </button>

                     <div className="w-px h-6 bg-slate-600 mx-1"></div>

                     {/* Column Selector */}
                     <div className="relative" ref={selectorRef}>
                        <button 
                            onClick={() => setShowColumnSelector(!showColumnSelector)}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm border border-slate-600 transition-colors"
                        >
                            <Settings2 className="w-4 h-4" /> Colunas
                        </button>
                        
                        {showColumnSelector && (
                            <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
                                <div className="p-3 border-b border-slate-700 font-bold text-xs text-slate-400 uppercase">
                                    Exibir Colunas
                                </div>
                                <div className="max-h-64 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                    {ALL_COLUMNS.map(col => (
                                        <div 
                                            key={col.id}
                                            onClick={() => toggleColumn(col.id)}
                                            className={`flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer text-sm ${col.locked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700'}`}
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${visibleColumnIds.has(col.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-500 bg-slate-900'}`}>
                                                {visibleColumnIds.has(col.id) && <CheckSquare className="w-3 h-3 text-white"/>}
                                            </div>
                                            <span className="text-slate-200">{col.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                     </div>

                    {selectedIds.size > 0 && (
                        <button 
                            onClick={handleExportBling}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium shadow-lg transition-all"
                            title="Exportar no formato Bling (58 colunas)"
                        >
                            <Download className="w-4 h-4" /> Exportar Bling ({selectedIds.size})
                        </button>
                    )}
                </div>
            </div>

            {/* AI BULK EDIT BAR */}
            {selectedIds.size > 0 && (
                <div className="bg-gradient-to-r from-indigo-900 to-slate-900 border-b border-indigo-500/30 p-3 flex items-center gap-3 animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm bg-indigo-950/50 px-3 py-1.5 rounded border border-indigo-500/50">
                        <Sparkles className="w-4 h-4" />
                        IA Editor
                    </div>
                    <div className="flex-1 flex gap-2">
                        <input 
                            type="text" 
                            value={aiCommand}
                            onChange={(e) => setAiCommand(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAiBulkEdit()}
                            placeholder={`Ex: "Pesquisar NCM" (Auto) ou "Mude o preço para 13,90" em ${selectedIds.size} itens...`}
                            className="w-full bg-slate-800 border border-slate-600 rounded px-4 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                            autoFocus
                        />
                        <button 
                            onClick={handleAiBulkEdit}
                            disabled={!aiCommand.trim() || isAiProcessing}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isAiProcessing ? 'Pensando...' : <><Send className="w-4 h-4" /> Executar</>}
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-xs sticky top-0 z-10 shadow-sm cursor-pointer select-none">
                        <tr>
                            <th className="p-4 w-10 text-center">
                                <button onClick={() => toggleSelectAll(filteredAndSortedProducts)}>
                                    {isAllVisibleSelected ? <CheckSquare className="w-4 h-4 text-indigo-500"/> : <Square className="w-4 h-4 text-slate-500"/>}
                                </button>
                            </th>
                            {activeColumns.map(col => (
                                <th 
                                    key={col.id} 
                                    className={`p-4 font-medium hover:text-white whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.id === 'image' || col.id === 'externalLink' ? 'w-16' : ''}`}
                                    onClick={() => !isEditMode && handleSort(col.id)}
                                >
                                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                                        {col.label} <SortIcon column={col.id} sortConfig={sortConfig}/>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {masterProducts.length === 0 ? (
                            <tr><td colSpan={activeColumns.length + 1} className="p-8 text-center text-slate-500">Nenhum produto cadastrado. Importe a planilha acima.</td></tr>
                        ) : (
                            filteredAndSortedProducts.map((p) => {
                                const isSelected = selectedIds.has(p.id);
                                return (
                                    <tr key={p.id} className={`hover:bg-slate-700/30 transition-colors ${isSelected ? 'bg-indigo-900/10' : ''}`}>
                                        <td className="p-4 text-center">
                                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(p.id)} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-600"/>
                                        </td>
                                        {activeColumns.map(col => (
                                            <td key={col.id} className={`p-4 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.id === 'sku' ? 'font-mono text-xs text-slate-400' : ''} ${col.id === 'name' ? 'font-medium text-white' : 'text-slate-300'} ${col.id === 'stock' && p.stock <= 0 ? 'text-red-500 font-bold' : ''}`}>
                                                {renderCell(p, col.id, isEditMode)}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="p-2 border-t border-slate-700 bg-slate-900 text-xs text-slate-500 flex justify-between px-4 items-center">
                <span>{filteredAndSortedProducts.length} visíveis</span>
                
                {selectedIds.size > 0 && (
                    <button 
                        onClick={() => setSelectedIds(new Set())}
                        className="flex items-center gap-1 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded transition-colors"
                    >
                        <XCircle className="w-3 h-3"/>
                        {selectedIds.size} selecionados (X - Desfazer Seleção)
                    </button>
                )}
                
                {isEditMode && <span className="text-amber-500 font-bold animate-pulse">MODO DE EDIÇÃO ATIVO</span>}
            </div>
        </div>
    </div>
  );
};

export default ProductDatabase;
