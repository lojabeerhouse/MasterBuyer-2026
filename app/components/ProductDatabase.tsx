
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MasterProduct, CategoryTree, CategoryNode } from '../types';
import { Database, Search, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Link as LinkIcon, RefreshCw, CircleHelp, X, Download, Settings2, Image, Pencil, Save, Sparkles, Send, XCircle, Bell, CheckCircle2, Check, Upload, FileText, LayoutGrid, Tag, ChevronDown, Undo2, ArrowRight, Package } from 'lucide-react';
import { interpretBulkEditCommand, batchSuggestNCM } from '../services/geminiService';
import { useCheckboxSelection } from './shared/useCheckboxSelection';
import { buildPath, getDescendantIds } from '../services/category_manager/categoryService';
import { appendAuditEntry, loadProductAuditLog } from '../services/auditService';
import { ProductAuditEntry } from '../types';

interface ProductDatabaseProps {
    masterProducts: MasterProduct[];
    setMasterProducts: React.Dispatch<React.SetStateAction<MasterProduct[]>>;
    sheetUrl: string;
    setSheetUrl: React.Dispatch<React.SetStateAction<string>>;
    categoryTree?: CategoryTree;
    setIsDirty: (dirty: boolean) => void;
    userId?: string;
    userDisplay?: string;
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
    { id: 'lastUpdatedAt', label: 'Última Atual.', type: 'text', align: 'center', editable: false },
];

// Default visible columns matches the previous version
const DEFAULT_VISIBLE_COLUMNS: (keyof MasterProduct | 'margin')[] = [
    'sku', 'name', 'supplier', 'stock', 'priceCost', 'priceSell', 'margin'
];

const SortIcon = ({ column, sortConfig }: { column: keyof MasterProduct | 'margin', sortConfig: SortConfig }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />;
};

const ProductDatabase: React.FC<ProductDatabaseProps> = ({ masterProducts = [], setMasterProducts, sheetUrl, setSheetUrl, categoryTree, setIsDirty, userId, userDisplay }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [sortConfig, setSortConfig] = useState<SortConfig>(null);
    const [inputUrl, setInputUrl] = useState(sheetUrl);
    const [showHelp, setShowHelp] = useState(false);
    const [showColumnSelector, setShowColumnSelector] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [draftProducts, setDraftProducts] = useState<MasterProduct[]>([]);

    // AI Edit State
    const [aiCommand, setAiCommand] = useState('');
    const [isAiProcessing, setIsAiProcessing] = useState(false);

    // Audit State
    const [historyProduct, setHistoryProduct] = useState<MasterProduct | null>(null);
    const [historyLogs, setHistoryLogs] = useState<ProductAuditEntry[] | null>(null);

    useEffect(() => {
        let active = true;
        if (historyProduct && userId) {
            setHistoryLogs(null);
            loadProductAuditLog(userId, historyProduct.id).then(logs => {
                if (active) setHistoryLogs(logs);
            });
        } else {
            setHistoryLogs(null);
        }
        return () => { active = false; };
    }, [historyProduct, userId]);

    // Import State
    const [pendingProducts, setPendingProducts] = useState<MasterProduct[] | null>(null);
    const [activeDiffTab, setActiveDiffTab] = useState<'new' | 'updated' | 'ignored'>('new');
    const [backupProducts, setBackupProducts] = useState<MasterProduct[] | null>(() => {
        try {
            const saved = localStorage.getItem('beerhouse_masterProducts_backup');
            return saved ? JSON.parse(saved) : null;
        } catch (_) {
            return null;
        }
    });
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    interface MergeDiff {
        newItems: MasterProduct[];
        updatedItems: {
            original: MasterProduct;
            updated: MasterProduct;
            changes: { field: string; label: string; from: any; to: any }[];
        }[];
        ignoredItems: MasterProduct[];
    }

    const calculatedDiff = useMemo<MergeDiff | null>(() => {
        if (!pendingProducts || pendingProducts.length === 0) return null;

        const existingBySku = new Map<string, MasterProduct>();
        masterProducts.forEach(p => {
            if (p.sku && p.sku.trim().toUpperCase() !== 'S/N') {
                existingBySku.set(p.sku.trim().toUpperCase(), p);
            }
        });

        const newItems: MasterProduct[] = [];
        const updatedItems: MergeDiff['updatedItems'] = [];
        const ignoredItems: MasterProduct[] = [];

        pendingProducts.forEach(imported => {
            const normSku = imported.sku ? imported.sku.trim().toUpperCase() : 'S/N';

            if (normSku === 'S/N' || !existingBySku.has(normSku)) {
                newItems.push({
                    ...imported,
                    id: imported.id || generateId()
                });
            } else {
                const original = existingBySku.get(normSku)!;
                const updatedProduct = { ...original };
                const changes: MergeDiff['updatedItems'][number]['changes'] = [];

                const fieldsToMerge: { field: keyof MasterProduct; label: string }[] = [
                    { field: 'name', label: 'Produto' },
                    { field: 'unit', label: 'Un.' },
                    { field: 'ncm', label: 'NCM' },
                    { field: 'priceSell', label: 'Venda' },
                    { field: 'priceCost', label: 'Custo' },
                    { field: 'stock', label: 'Estoque' },
                    { field: 'supplier', label: 'Fornecedor' },
                    { field: 'ean', label: 'EAN/GTIN' },
                    { field: 'brand', label: 'Marca' },
                    { field: 'category', label: 'Categoria' },
                    { field: 'productGroup', label: 'Grupo Produtos' },
                    { field: 'tags', label: 'Tags' },
                    { field: 'department', label: 'Departamento' },
                    { field: 'origin', label: 'Origem' },
                    { field: 'status', label: 'Situação' },
                    { field: 'observations', label: 'Obs' },
                    { field: 'image', label: 'Img' },
                    { field: 'externalLink', label: 'Link' },
                    { field: 'expiryDate', label: 'Validade' },
                    { field: 'netWeight', label: 'Peso Líq.' },
                    { field: 'grossWeight', label: 'Peso Bruto' },
                    { field: 'minStock', label: 'Est. Mín' },
                    { field: 'maxStock', label: 'Est. Máx' },
                    { field: 'width', label: 'Larg.' },
                    { field: 'height', label: 'Alt.' },
                    { field: 'depth', label: 'Prof.' },
                    { field: 'location', label: 'Local.' }
                ];

                fieldsToMerge.forEach(({ field, label }) => {
                    const impVal = imported[field];
                    const origVal = original[field];

                    if (impVal !== undefined && impVal !== '') {
                        if (typeof impVal === 'number') {
                            const oNum = origVal !== undefined ? Number(origVal) : 0;
                            const iNum = Number(impVal);
                            if (Math.abs(oNum - iNum) > 0.0001) {
                                (updatedProduct as any)[field] = iNum;
                                changes.push({ field, label, from: oNum, to: iNum });
                            }
                        } else {
                            const oStr = String(origVal || '').trim();
                            const iStr = String(impVal).trim();
                            if (oStr !== iStr) {
                                (updatedProduct as any)[field] = iStr;
                                changes.push({ field, label, from: oStr || '-', to: iStr });
                            }
                        }
                    }
                });

                if (changes.length > 0) {
                    updatedItems.push({
                        original,
                        updated: updatedProduct,
                        changes
                    });
                } else {
                    ignoredItems.push(original);
                }
            }
        });

        return { newItems, updatedItems, ignoredItems };
    }, [pendingProducts, masterProducts]);

    // Toasts
    const [toasts, setToasts] = useState<ToastNotification[]>([]);

    // Selection Hook
    const { selectedIds, setSelectedIds, handleChange, toggleAll, clearSelection, isAllSelected } = useCheckboxSelection<MasterProduct>();

    // Initialize columns from LocalStorage
    const [visibleColumnIds, setVisibleColumnIds] = useState<Set<keyof MasterProduct | 'margin'>>(() => {
        try {
            const saved = localStorage.getItem('beerhouse_db_columns');
            if (saved) return new Set(JSON.parse(saved));
        } catch (e) { }
        return new Set(DEFAULT_VISIBLE_COLUMNS);
    });

    const selectorRef = useRef<HTMLDivElement>(null);

    // ── Debounce search (400ms) ──────────────────────────────────────────────────
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
        return () => clearTimeout(t);
    }, [searchTerm]);

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
        setDraftProducts(prev => prev.map(p => {
            if (p.id === id) {
                return { ...p, [field]: value };
            }
            return p;
        }));
    };

    const handleStartEdit = () => {
        setDraftProducts([...masterProducts]);
        setIsEditMode(true);
        setIsDirty(true);
    };

    const handleSaveEdit = () => {
        const now = new Date().toISOString();
        let changedCount = 0;
        
        const finalProducts = draftProducts.map(draftP => {
            const original = masterProducts.find(m => m.id === draftP.id);
            if (!original) return draftP;
            
            const changes: any[] = [];
            ALL_COLUMNS.forEach(col => {
                if (col.id !== 'margin' && col.id !== 'lastUpdatedAt' && col.editable) {
                    const from = original[col.id];
                    const to = draftP[col.id];
                    if (from !== to) {
                        changes.push({ field: col.id, label: col.label, from: from || '-', to: to || '-' });
                    }
                }
            });
            
            if (changes.length > 0) {
                changedCount++;
                const audited = {
                    ...draftP,
                    lastUpdatedAt: now,
                    lastUpdatedBy: userDisplay || userId || 'Sistema',
                    lastUpdateSource: 'manual_edit' as const
                };
                
                if (userId) {
                    appendAuditEntry(userId, draftP.id, draftP.sku, {
                        timestamp: now,
                        userId,
                        userDisplay: userDisplay || 'Sistema',
                        source: 'manual_edit',
                        fields: changes
                    });
                }
                return audited;
            }
            return draftP;
        });

        setMasterProducts(finalProducts);
        setIsEditMode(false);
        setIsDirty(false);
        if (changedCount > 0) {
            addToast(`Alterações salvas com sucesso em ${changedCount} produtos!`, "success");
        } else {
            addToast("Nenhuma alteração detectada.", "info");
        }
    };

    const handleCancelEdit = () => {
        setDraftProducts([]);
        setIsEditMode(false);
        setIsDirty(false);
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

        setPendingProducts(finalProducts);
        setShowConfirmModal(true);
        setErrorMsg("");
    };

    const handleConfirmImport = () => {
        if (calculatedDiff) {
            // 1. Criar backup do estado atual
            setBackupProducts(masterProducts);
            try {
                localStorage.setItem('beerhouse_masterProducts_backup', JSON.stringify(masterProducts));
            } catch (_) { }

            // 2. Realizar o merge
            const updatedMap = new Map<string, MasterProduct>();
            calculatedDiff.updatedItems.forEach(item => {
                updatedMap.set(item.original.id, item.updated);
            });

            const mergedProducts = [
                ...masterProducts.map(p => {
                    if (updatedMap.has(p.id)) {
                        const updatedProduct = updatedMap.get(p.id)!;
                        const now = new Date().toISOString();
                        const auditedProduct = {
                            ...updatedProduct,
                            lastUpdatedAt: now,
                            lastUpdatedBy: userDisplay || userId || 'Sistema',
                            lastUpdateSource: 'import' as const
                        };
                        if (userId) {
                            const diffItem = calculatedDiff.updatedItems.find(i => i.original.id === p.id);
                            if (diffItem) {
                                appendAuditEntry(userId, p.id, p.sku, {
                                    timestamp: now,
                                    userId,
                                    userDisplay: userDisplay || 'Sistema',
                                    source: 'import',
                                    fields: diffItem.changes
                                });
                            }
                        }
                        return auditedProduct;
                    }
                    return p;
                }),
                ...calculatedDiff.newItems.map(p => {
                    const now = new Date().toISOString();
                    const auditedProduct = {
                        ...p,
                        lastUpdatedAt: now,
                        lastUpdatedBy: userDisplay || userId || 'Sistema',
                        lastUpdateSource: 'import' as const
                    };
                    if (userId) {
                        appendAuditEntry(userId, p.id, p.sku, {
                            timestamp: now,
                            userId,
                            userDisplay: userDisplay || 'Sistema',
                            source: 'import',
                            fields: [{ field: 'new', label: 'Produto Novo', from: '-', to: 'Criado via Importação' }]
                        });
                    }
                    return auditedProduct;
                })
            ];

            setMasterProducts(mergedProducts);
            addToast(`${calculatedDiff.newItems.length} novos, ${calculatedDiff.updatedItems.length} atualizados de ${pendingProducts?.length || 0} produtos!`, 'success');

            setPendingProducts(null);
            setShowConfirmModal(false);
        }
    };

    const handleRollback = () => {
        if (backupProducts) {
            setMasterProducts(backupProducts);
            try {
                localStorage.removeItem('beerhouse_masterProducts_backup');
            } catch (_) { }
            setBackupProducts(null);
            addToast("Importação de produtos desfeita com sucesso!", "info");
        }
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
                switch (header) {
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
                    case 'Categoria do produto': return p.category ?? (categoryTree && p.categoryId ? buildPath(categoryTree, p.categoryId) : '');
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

                const now = new Date().toISOString();
                setMasterProducts(prev => prev.map(p => {
                    if (ncmMap.has(p.id)) {
                        const newNcm = ncmMap.get(p.id)!;
                        if (p.ncm !== newNcm) {
                            const audited = {
                                ...p,
                                ncm: newNcm,
                                lastUpdatedAt: now,
                                lastUpdatedBy: userDisplay || userId || 'Sistema',
                                lastUpdateSource: 'ai_edit' as const
                            };
                            if (userId) {
                                appendAuditEntry(userId, p.id, p.sku, {
                                    timestamp: now,
                                    userId,
                                    userDisplay: userDisplay || 'Sistema',
                                    source: 'ai_edit',
                                    fields: [{ field: 'ncm', label: 'NCM', from: p.ncm || '-', to: newNcm }]
                                });
                            }
                            return audited;
                        }
                    }
                    return p;
                }));

                addToast(`NCMs encontrados e atualizados para ${ncmResults.length} produtos!`, 'success');

            } else {
                // STANDARD FIELD UPDATE
                const now = new Date().toISOString();
                setMasterProducts(prev => prev.map(p => {
                    if (selectedIds.has(p.id) && p[result.field!] !== result.value) {
                        const audited = {
                            ...p,
                            [result.field!]: result.value,
                            lastUpdatedAt: now,
                            lastUpdatedBy: userDisplay || userId || 'Sistema',
                            lastUpdateSource: 'ai_edit' as const
                        };
                        if (userId) {
                            appendAuditEntry(userId, p.id, p.sku, {
                                timestamp: now,
                                userId,
                                userDisplay: userDisplay || 'Sistema',
                                source: 'ai_edit',
                                fields: [{ field: result.field!, label: ALL_COLUMNS.find(c => c.id === result.field)?.label || result.field!, from: p[result.field!] || '-', to: result.value }]
                            });
                        }
                        return audited;
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
        if (isEditing && def?.editable) {
            // Use product from draft
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
            return product.image ? <a href={product.image} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-white flex items-center justify-center"><Image className="w-4 h-4" /></a> : <span className="text-slate-600 text-center block">-</span>;
        }
        if (colId === 'externalLink') {
            return product.externalLink ? <a href={product.externalLink} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-white flex items-center justify-center"><LinkIcon className="w-4 h-4" /></a> : <span className="text-slate-600 text-center block">-</span>;
        }
        if (colId === 'lastUpdatedAt') {
            if (!product.lastUpdatedAt) return <span className="text-slate-600 text-center block">-</span>;
            const dateStr = new Date(product.lastUpdatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            let icon = null;
            if (product.lastUpdateSource === 'import') icon = <Upload className="w-3 h-3 text-amber-400" />;
            else if (product.lastUpdateSource === 'manual_edit') icon = <Pencil className="w-3 h-3 text-blue-400" />;
            else if (product.lastUpdateSource === 'ai_edit') icon = <Sparkles className="w-3 h-3 text-purple-400" />;
            else if (product.lastUpdateSource === 'inventory_sync') icon = <Package className="w-3 h-3 text-green-400" />;
            
            return (
                <div className="flex items-center gap-1.5 justify-center text-slate-300 text-xs">
                    {icon}
                    <span>{dateStr}</span>
                </div>
            );
        }
        if (colId === 'sku') {
            const val = product[colId];
            let badge = null;
            if (product.lastUpdatedAt) {
                const updatedTime = new Date(product.lastUpdatedAt).getTime();
                const isRecent = (Date.now() - updatedTime) < 24 * 60 * 60 * 1000;
                if (isRecent) {
                    badge = (
                        <span className={`ml-2 px-1 py-[1px] rounded text-[8px] font-bold uppercase tracking-wider ${product.lastUpdateSource === 'import' ? 'bg-amber-900/50 text-amber-400 border border-amber-800/50' : 'bg-blue-900/50 text-blue-400 border border-blue-800/50'}`}>
                            {product.lastUpdateSource === 'import' ? 'IMP' : product.lastUpdateSource === 'ai_edit' ? 'IA' : 'UPD'}
                        </span>
                    );
                }
            }
            return (
                <div className="flex items-center gap-2">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setHistoryProduct(product); }}
                        className="text-slate-500 hover:text-amber-400 transition-colors"
                        title="Ver histórico de alterações"
                    >
                        <FileText className="w-3.5 h-3.5" />
                    </button>
                    <span>{val || '-'}</span>
                    {badge}
                </div>
            );
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
        let result = isEditMode ? draftProducts : masterProducts;

        // 1. Category Filter
        if (selectedCategoryId && categoryTree) {
            const descendantIds = new Set(getDescendantIds(categoryTree, selectedCategoryId));
            result = result.filter(p => p.categoryId && descendantIds.has(p.categoryId));
        }

        // 2. Search Filter
        if (debouncedSearch) {
            const tokens = debouncedSearch.toLowerCase().split(/\s+/).filter(t => t);
            result = result.filter(p => {
                const searchableText = `${p.name} ${p.sku} ${p.ean} ${p.brand || ''} ${p.category || ''} ${p.tags || ''}`.toLowerCase();
                return tokens.every(token => searchableText.includes(token));
            });
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
        return result.slice(0, 50);
    }, [masterProducts, debouncedSearch, sortConfig, visibleColumnIds, isEditMode, draftProducts, selectedCategoryId, categoryTree]);

    const totalStockValue = useMemo(
        () => masterProducts.reduce((acc, curr) => acc + (curr.priceCost * curr.stock), 0),
        [masterProducts]
    );
    const isAllVisibleSelected = filteredAndSortedProducts.length > 0 && filteredAndSortedProducts.every(p => selectedIds.has(p.id));

    const activeColumns = useMemo(
        () => ALL_COLUMNS.filter(c => visibleColumnIds.has(c.id)),
        [visibleColumnIds]
    );

    return (
        <div className="flex flex-col h-full space-y-3 relative bg-slate-950">
            {/* TOAST CONTAINER */}
            <div className="fixed bottom-4 right-4 z-[150] flex flex-col gap-2 pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto bg-slate-900 border border-slate-700 border-l-4 rounded shadow-2xl p-3 w-80 transform transition-all duration-[5000ms] ease-out flex items-start gap-3
                        ${toast.type === 'success' ? 'border-l-green-500' : toast.type === 'error' ? 'border-l-red-500' : 'border-l-blue-500'}
                        ${toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
                    `}
                    >
                        <div className="mt-0.5">
                            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                            {toast.type === 'info' && <Bell className="w-5 h-5 text-blue-500" />}
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-slate-200">{toast.message}</p>
                        </div>
                        <button onClick={() => removeToast(toast.id)} className="text-slate-500 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            {/* COMPACT HEADER (Forcato ERP Design) */}
            <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between gap-4 shadow-sm shrink-0">
                <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-amber-600" />
                    <div>
                        <h2 className="text-sm font-bold text-white tracking-tight uppercase">Banco de Produtos</h2>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase">
                            <span>{masterProducts.length.toLocaleString()} Itens</span>
                            <span className="w-px h-2 bg-slate-700"></span>
                            <span className="text-green-500">Estoque: R$ {totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 max-w-xl flex items-center gap-2">
                    <div className="relative flex-1 group">
                        <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-amber-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Link Google Sheets (CSV/TSV)..."
                            value={inputUrl}
                            onChange={(e) => setInputUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchFromUrl(inputUrl)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-8 py-1.5 text-xs text-white focus:border-amber-600 focus:outline-none transition-all"
                        />
                        <button
                            onClick={() => setShowHelp(!showHelp)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors"
                            title="Ajuda / Como configurar"
                        >
                            <CircleHelp className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <button
                        onClick={() => fetchFromUrl(inputUrl)}
                        disabled={isProcessing}
                        className="bg-amber-600 hover:bg-amber-700 text-white p-1.5 rounded transition-all disabled:opacity-50"
                        title="Sincronizar Planilha Google"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                    </button>

                    <div className="w-px h-4 bg-slate-800 mx-1"></div>

                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.tsv,.txt" onChange={handleCsvUpload} />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessing}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 border border-slate-700 rounded transition-all disabled:opacity-50"
                        title="Upload Arquivo Local (Cadastro Novo)"
                    >
                        <Upload className="w-3.5 h-3.5" />
                    </button>

                    {backupProducts && (
                        <button
                            onClick={handleRollback}
                            className="bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 p-1.5 px-2.5 rounded transition-all flex items-center gap-1.5 text-[11px] font-bold uppercase"
                            title="Desfazer Última Importação (Rollback)"
                        >
                            <Undo2 className="w-3.5 h-3.5" />
                            <span>Desfazer</span>
                        </button>
                    )}
                </div>

                {/* CONFIRM IMPORT MODAL (Seguindo Forcato-design) */}
                {showConfirmModal && pendingProducts && (
                    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95">
                            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                                <div>
                                    <h3 className="font-bold text-white uppercase text-sm flex items-center gap-2">
                                        <Database className="w-4 h-4 text-amber-500" /> Confirmar Importação (Merge por SKU)
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                                        Total: {pendingProducts.length} itens.
                                        {calculatedDiff && (
                                            <>
                                                {" • "}<span className="text-green-400">{calculatedDiff.newItems.length} novos</span>
                                                {" • "}<span className="text-amber-400">{calculatedDiff.updatedItems.length} atualizações</span>
                                                {" • "}<span className="text-slate-400">{calculatedDiff.ignoredItems.length} sem alterações</span>
                                            </>
                                        )}
                                    </p>
                                </div>
                                <button onClick={() => setShowConfirmModal(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
                            </div>

                            {/* Tabs Header */}
                            <div className="flex bg-slate-900/80 border-b border-slate-800 px-4 py-2 gap-2 shrink-0">
                                <button
                                    onClick={() => setActiveDiffTab('new')}
                                    className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition-all flex items-center gap-2 ${activeDiffTab === 'new'
                                        ? 'bg-green-950/50 border border-green-800 text-green-400'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                                        }`}
                                >
                                    <span>Novos</span>
                                    <span className="bg-green-900/40 px-1.5 py-0.5 rounded text-[10px] text-green-400">
                                        {calculatedDiff?.newItems.length || 0}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setActiveDiffTab('updated')}
                                    className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition-all flex items-center gap-2 ${activeDiffTab === 'updated'
                                        ? 'bg-amber-950/50 border border-amber-800 text-amber-400'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                                        }`}
                                >
                                    <span>Atualizados</span>
                                    <span className="bg-amber-900/40 px-1.5 py-0.5 rounded text-[10px] text-amber-400">
                                        {calculatedDiff?.updatedItems.length || 0}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setActiveDiffTab('ignored')}
                                    className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition-all flex items-center gap-2 ${activeDiffTab === 'ignored'
                                        ? 'bg-slate-800/50 border border-slate-700 text-slate-300'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                                        }`}
                                >
                                    <span>Sem Alteração</span>
                                    <span className="bg-slate-800/40 px-1.5 py-0.5 rounded text-[10px] text-slate-400">
                                        {calculatedDiff?.ignoredItems.length || 0}
                                    </span>
                                </button>
                            </div>

                            {/* Tab Content */}
                            {activeDiffTab === 'new' && (
                                <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-slate-950">
                                    {!calculatedDiff || calculatedDiff.newItems.length === 0 ? (
                                        <div className="text-center text-slate-500 py-12 text-xs font-bold uppercase">
                                            Nenhum produto novo nesta importação.
                                        </div>
                                    ) : (
                                        <table className="w-full text-left text-[11px] border-collapse">
                                            <thead className="bg-slate-900 sticky top-0 text-slate-500 uppercase font-bold z-10">
                                                <tr>
                                                    <th className="p-2 px-3 border-b border-slate-800">SKU</th>
                                                    <th className="p-2 px-3 border-b border-slate-800">Produto</th>
                                                    <th className="p-2 px-3 border-b border-slate-800 text-right w-24">Custo</th>
                                                    <th className="p-2 px-3 border-b border-slate-800 text-right w-24">Venda</th>
                                                    <th className="p-2 px-3 border-b border-slate-800 text-right w-20">Estoque</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/40">
                                                {calculatedDiff.newItems.slice(0, 100).map((p, i) => (
                                                    <tr key={i} className="hover:bg-slate-900/50">
                                                        <td className="p-2 px-3 font-mono text-green-400 font-bold">{p.sku}</td>
                                                        <td className="p-2 px-3 text-slate-200 font-medium">{p.name}</td>
                                                        <td className="p-2 px-3 text-right text-slate-400">R$ {p.priceCost.toFixed(2)}</td>
                                                        <td className="p-2 px-3 text-right text-slate-400">R$ {p.priceSell.toFixed(2)}</td>
                                                        <td className="p-2 px-3 text-right text-slate-400">{p.stock}</td>
                                                    </tr>
                                                ))}
                                                {calculatedDiff.newItems.length > 100 && (
                                                    <tr>
                                                        <td colSpan={5} className="p-4 text-center text-slate-600 italic">... e mais {calculatedDiff.newItems.length - 100} itens.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {activeDiffTab === 'updated' && (
                                <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-slate-950">
                                    {!calculatedDiff || calculatedDiff.updatedItems.length === 0 ? (
                                        <div className="text-center text-slate-500 py-12 text-xs font-bold uppercase">
                                            Nenhuma atualização pendente nos produtos existentes.
                                        </div>
                                    ) : (
                                        <table className="w-full text-left text-[11px] border-collapse">
                                            <thead className="bg-slate-900 sticky top-0 text-slate-500 uppercase font-bold z-10">
                                                <tr>
                                                    <th className="p-2 px-3 border-b border-slate-800 w-24">SKU</th>
                                                    <th className="p-2 px-3 border-b border-slate-800 w-48">Produto</th>
                                                    <th className="p-2 px-3 border-b border-slate-800">Alterações Detectadas (Antes ➔ Depois)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/40">
                                                {calculatedDiff.updatedItems.slice(0, 100).map((item, i) => (
                                                    <tr key={i} className="hover:bg-slate-900/50 align-top">
                                                        <td className="p-2 px-3 font-mono text-amber-400 font-bold">{item.original.sku}</td>
                                                        <td className="p-2 px-3 text-slate-200 font-medium">
                                                            <div className="truncate max-w-[200px]" title={item.original.name}>{item.original.name}</div>
                                                        </td>
                                                        <td className="p-2 px-3">
                                                            <div className="flex flex-wrap gap-1.5 py-0.5">
                                                                {item.changes.map((c, idx) => (
                                                                    <span key={idx} className="inline-flex items-center gap-1 bg-amber-950/20 border border-amber-900/40 rounded px-2 py-0.5 text-[10px] text-amber-300">
                                                                        <strong className="text-amber-400/80">{c.label}:</strong>
                                                                        <span className="text-slate-500 line-through">
                                                                            {c.field.toLowerCase().includes('price') || c.field === 'priceCost' || c.field === 'priceSell' ? `R$ ${Number(c.from).toFixed(2)}` : c.from}
                                                                        </span>
                                                                        <span className="text-slate-400 font-bold">➔</span>
                                                                        <span className="text-amber-200 font-bold">
                                                                            {c.field.toLowerCase().includes('price') || c.field === 'priceCost' || c.field === 'priceSell' ? `R$ ${Number(c.to).toFixed(2)}` : c.to}
                                                                        </span>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {calculatedDiff.updatedItems.length > 100 && (
                                                    <tr>
                                                        <td colSpan={3} className="p-4 text-center text-slate-600 italic">... e mais {calculatedDiff.updatedItems.length - 100} itens.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {activeDiffTab === 'ignored' && (
                                <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-slate-950">
                                    {!calculatedDiff || calculatedDiff.ignoredItems.length === 0 ? (
                                        <div className="text-center text-slate-500 py-12 text-xs font-bold uppercase">
                                            Nenhum produto idêntico ignorado.
                                        </div>
                                    ) : (
                                        <table className="w-full text-left text-[11px] border-collapse text-slate-400">
                                            <thead className="bg-slate-900 sticky top-0 text-slate-500 uppercase font-bold z-10">
                                                <tr>
                                                    <th className="p-2 px-3 border-b border-slate-800">SKU</th>
                                                    <th className="p-2 px-3 border-b border-slate-800">Produto</th>
                                                    <th className="p-2 px-3 border-b border-slate-800 text-right w-24">Custo</th>
                                                    <th className="p-2 px-3 border-b border-slate-800 text-right w-24">Venda</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/40">
                                                {calculatedDiff.ignoredItems.slice(0, 50).map((p, i) => (
                                                    <tr key={i} className="hover:bg-slate-900/50 opacity-60">
                                                        <td className="p-2 px-3 font-mono text-slate-500">{p.sku}</td>
                                                        <td className="p-2 px-3 text-slate-400">{p.name}</td>
                                                        <td className="p-2 px-3 text-right text-slate-500">R$ {p.priceCost.toFixed(2)}</td>
                                                        <td className="p-2 px-3 text-right text-slate-500">R$ {p.priceSell.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                                {calculatedDiff.ignoredItems.length > 50 && (
                                                    <tr>
                                                        <td colSpan={4} className="p-4 text-center text-slate-600 italic">... e mais {calculatedDiff.ignoredItems.length - 50} itens.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end gap-3 shrink-0">
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="px-4 py-2 text-xs font-bold uppercase text-slate-400 hover:text-white transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmImport}
                                    className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold uppercase shadow-lg shadow-amber-900/20 transition-all flex items-center gap-2"
                                >
                                    <CheckCircle2 className="w-4 h-4" /> Confirmar Merge
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showHelp && (
                    <div className="absolute top-14 left-1/2 -translate-x-1/2 w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-4 z-[100] animate-in fade-in zoom-in-95">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-xs font-bold text-white uppercase flex items-center gap-2">
                                <CircleHelp className="w-3.5 h-3.5 text-amber-500" /> Configuração de Link
                            </h4>
                            <button onClick={() => setShowHelp(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                        </div>
                        <ol className="text-[11px] text-slate-400 space-y-2 list-decimal pl-4">
                            <li>No Google Sheets: <span className="text-slate-200">Arquivo &gt; Compartilhar &gt; Publicar na Web</span>.</li>
                            <li>Selecione <span className="text-slate-200">Valores separados por TAB (.tsv)</span> ou CSV.</li>
                            <li>Clique em <span className="text-slate-200">Publicar</span> e cole o link acima.</li>
                        </ol>
                    </div>
                )}

                {errorMsg && (
                    <div className="absolute top-14 right-4 bg-red-950/90 border border-red-500 text-red-200 text-[11px] px-3 py-2 rounded shadow-2xl flex items-center gap-2 z-[100] animate-in slide-in-from-right-4">
                        <AlertCircle className="w-3.5 h-3.5" /> {errorMsg}
                        <button onClick={() => setErrorMsg('')}><X className="w-3 h-3" /></button>
                    </div>
                )}
            </div>

            {/* Table Panel */}
            <div className="flex-1 bg-slate-900 border-t border-slate-800 flex flex-col overflow-hidden">
                <div className="p-2 px-4 border-b border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-900/50 shrink-0">
                    <div className="relative w-full md:max-w-xs group">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-amber-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-4 py-1.5 text-xs text-white focus:border-amber-600 focus:outline-none transition-all"
                        />
                    </div>

                    {/* Category Filter */}
                    {categoryTree && Object.keys(categoryTree).length > 0 && (
                        <div className="relative w-full md:max-w-[200px]">
                            <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                            <select
                                value={selectedCategoryId || ''}
                                onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                                className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-4 py-1.5 text-xs text-white focus:border-amber-600 focus:outline-none appearance-none cursor-pointer"
                            >
                                <option value="">Todas Categorias</option>
                                {(Object.entries(categoryTree) as [string, CategoryNode][])
                                    .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
                                    .map(([id, node]) => (
                                        <option key={id} value={id}>
                                            {node.nome}
                                        </option>
                                    ))
                                }
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        {!isEditMode ? (
                            <button
                                onClick={handleStartEdit}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded text-[11px] font-bold uppercase transition-all"
                            >
                                <Pencil className="w-3.5 h-3.5" /> Modo Edição
                            </button>
                        ) : (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSaveEdit}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-bold uppercase shadow-lg transition-all"
                                >
                                    <Save className="w-3.5 h-3.5" /> Salvar
                                </button>
                                <button
                                    onClick={handleCancelEdit}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-400 border border-slate-700 rounded text-[11px] font-bold uppercase transition-all"
                                >
                                    <XCircle className="w-3.5 h-3.5" /> Cancelar
                                </button>
                            </div>
                        )}

                        <div className="w-px h-4 bg-slate-800 mx-1"></div>

                        <div className="relative" ref={selectorRef}>
                            <button
                                onClick={() => setShowColumnSelector(!showColumnSelector)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-bold uppercase border border-slate-700 transition-all"
                            >
                                <Settings2 className="w-3.5 h-3.5" /> Colunas
                            </button>

                            {showColumnSelector && (
                                <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-[110] overflow-hidden">
                                    <div className="p-3 border-b border-slate-800 font-bold text-[10px] text-slate-500 uppercase tracking-wider bg-slate-950/50">
                                        Configurar Colunas
                                    </div>
                                    <div className="max-h-64 overflow-y-auto p-1 custom-scrollbar">
                                        {ALL_COLUMNS.map(col => (
                                            <div
                                                key={col.id}
                                                onClick={() => toggleColumn(col.id)}
                                                className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-xs transition-colors ${col.locked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-800 text-slate-300 hover:text-white'}`}
                                            >
                                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${visibleColumnIds.has(col.id) ? 'bg-amber-600 border-amber-600' : 'border-slate-700 bg-slate-950'}`}>
                                                    {visibleColumnIds.has(col.id) && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                                                </div>
                                                <span>{col.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {selectedIds.size > 0 && (
                            <button
                                onClick={handleExportBling}
                                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-[11px] font-bold uppercase shadow-lg transition-all"
                            >
                                <Download className="w-3.5 h-3.5" /> Exportar Bling
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-left text-[12px] border-collapse">
                        <thead className="bg-slate-950/80 text-slate-500 uppercase text-[10px] font-bold sticky top-0 z-[10] backdrop-blur-sm shadow-sm">
                            <tr>
                                <th className="p-2 px-3 w-10 text-center border-b border-slate-800">
                                    <div onClick={() => toggleAll(filteredAndSortedProducts)} className="flex items-center justify-center cursor-pointer">
                                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${isAllSelected(filteredAndSortedProducts) ? 'bg-amber-600 border-amber-600' : 'border-slate-700 bg-slate-900'}`}>
                                            {isAllSelected(filteredAndSortedProducts) && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                                        </div>
                                    </div>
                                </th>
                                {activeColumns.map(col => (
                                    <th
                                        key={col.id}
                                        className={`p-2 px-3 border-b border-slate-800 whitespace-nowrap cursor-pointer hover:bg-slate-900/50 transition-colors ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                                        onClick={() => !isEditMode && handleSort(col.id)}
                                    >
                                        <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                                            {col.label} <SortIcon column={col.id} sortConfig={sortConfig} />
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {masterProducts.length === 0 ? (
                                <tr><td colSpan={activeColumns.length + 1} className="p-12 text-center text-slate-600 font-medium">Nenhum produto importado. Utilize o link da planilha no topo.</td></tr>
                            ) : (
                                filteredAndSortedProducts.map((p) => {
                                    const isSelected = selectedIds.has(p.id);
                                    return (
                                        <tr
                                            key={p.id}
                                            className={`group transition-all h-[36px] ${isSelected ? 'bg-amber-600/10' : 'hover:bg-slate-800/40'}`}
                                        >
                                            <td
                                                className="p-2 px-3 text-center border-l-2 border-transparent group-hover:border-amber-600/30 transition-all cursor-pointer"
                                                onClick={(e) => handleChange(p.id, e.shiftKey, filteredAndSortedProducts)}
                                            >
                                                <div className="flex items-center justify-center">
                                                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-amber-600 border-amber-600' : 'border-slate-700 bg-slate-900'}`}>
                                                        {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                                                    </div>
                                                </div>
                                            </td>
                                            {activeColumns.map(col => (
                                                <td key={col.id} className={`p-1.5 px-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.id === 'sku' ? 'font-mono text-[11px] text-slate-500' : ''} ${col.id === 'name' ? 'font-bold text-white text-[13px]' : 'text-slate-300'} ${col.id === 'stock' && p.stock <= 0 ? 'text-red-500 font-bold' : ''}`}>
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

                <div className="p-1.5 px-4 border-t border-slate-800 bg-slate-950 text-[10px] text-slate-500 font-bold uppercase flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <span>{filteredAndSortedProducts.length} visíveis de {masterProducts.length}</span>
                        {selectedIds.size > 0 && <span className="text-amber-500 font-black">{selectedIds.size} selecionados</span>}
                    </div>

                    <div className="flex items-center gap-3">
                        {isEditMode && <span className="text-amber-500 animate-pulse">● Modo Edição Ativo</span>}
                        <span className="text-slate-700">MasterBuyer 2026</span>
                    </div>
                </div>
            </div>
            {/* AI BULK EDIT BAR (Seguindo Forcato-design) */}
            {selectedIds.size > 0 && (
                <div className="bg-slate-950/80 border-b border-amber-600/30 p-2 flex items-center gap-3 shrink-0 animate-in slide-in-from-top-1">
                    <div className="flex items-center gap-2 text-amber-500 font-bold text-[10px] uppercase bg-amber-950/20 px-3 py-1 rounded border border-amber-600/20">
                        <Sparkles className="w-3 h-3" />
                        IA Editor ({selectedIds.size})
                    </div>
                    <div className="flex-1 flex gap-2">
                        <input
                            type="text"
                            value={aiCommand}
                            onChange={(e) => setAiCommand(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAiBulkEdit()}
                            placeholder="Mudar NCM para 1234.56.78..."
                            className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:border-amber-600 focus:outline-none"
                            autoFocus
                        />
                        <button
                            onClick={handleAiBulkEdit}
                            disabled={!aiCommand.trim() || isAiProcessing}
                            className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            {isAiProcessing ? 'Executando...' : 'Aplicar'}
                        </button>
                    </div>
                    <button onClick={clearSelection} className="p-1.5 text-slate-500 hover:text-white transition-colors" title="Limpar Seleção">
                        <XCircle className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* AUDIT HISTORY DRAWER */}
            {historyProduct && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
                    <div className="w-[450px] bg-[#0e0b08] border-l border-amber-900/30 flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-4 border-b border-amber-900/30 flex justify-between items-start bg-slate-900/50">
                            <div>
                                <h3 className="font-display font-bold text-lg text-amber-500">Histórico do Produto</h3>
                                <p className="text-xs text-slate-400 font-mono mt-1">{historyProduct.sku} - {historyProduct.name}</p>
                            </div>
                            <button onClick={() => setHistoryProduct(null)} className="p-1 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {!historyLogs ? (
                                <div className="text-center text-slate-500 py-10 flex flex-col items-center gap-3">
                                    <RefreshCw className="w-6 h-6 animate-spin text-amber-600" />
                                    <span className="text-xs">Carregando histórico...</span>
                                </div>
                            ) : historyLogs.length === 0 ? (
                                <div className="text-center text-slate-500 py-10 flex flex-col items-center gap-3">
                                    <FileText className="w-8 h-8 opacity-20" />
                                    <span className="text-xs">Nenhum registro de alteração encontrado.</span>
                                </div>
                            ) : (
                                historyLogs.map((log, i) => {
                                    const dateStr = new Date(log.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                                    let icon = <FileText className="w-4 h-4 text-slate-400" />;
                                    let typeColor = 'text-slate-400';
                                    let typeBg = 'bg-slate-900';
                                    let typeLabel = 'Edição';
                                    
                                    if (log.source === 'import') { icon = <Upload className="w-4 h-4 text-amber-400" />; typeColor = 'text-amber-400'; typeBg = 'bg-amber-900/30'; typeLabel = 'Importação CSV'; }
                                    else if (log.source === 'manual_edit') { icon = <Pencil className="w-4 h-4 text-blue-400" />; typeColor = 'text-blue-400'; typeBg = 'bg-blue-900/30'; typeLabel = 'Edição Manual'; }
                                    else if (log.source === 'ai_edit') { icon = <Sparkles className="w-4 h-4 text-purple-400" />; typeColor = 'text-purple-400'; typeBg = 'bg-purple-900/30'; typeLabel = 'IA bulk edit'; }
                                    else if (log.source === 'inventory_sync') { icon = <Package className="w-4 h-4 text-green-400" />; typeColor = 'text-green-400'; typeBg = 'bg-green-900/30'; typeLabel = 'Sincronização'; }

                                    return (
                                        <div key={i} className="bg-slate-900 rounded border border-slate-800 overflow-hidden">
                                            <div className={`px-3 py-2 border-b border-slate-800 flex justify-between items-center ${typeBg}`}>
                                                <div className="flex items-center gap-2">
                                                    {icon}
                                                    <span className={`text-xs font-bold uppercase tracking-wider ${typeColor}`}>{typeLabel}</span>
                                                </div>
                                                <div className="text-[10px] text-slate-400 flex flex-col items-end">
                                                    <span>{dateStr}</span>
                                                    <span className="opacity-70">{log.userDisplay}</span>
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-900/50">
                                                {log.fields.length > 0 ? (
                                                    <ul className="space-y-1.5">
                                                        {log.fields.map((f, fi) => (
                                                            <li key={fi} className="text-xs flex gap-2">
                                                                <span className="text-slate-500 min-w-[80px] font-medium">{f.label}:</span>
                                                                <span className="text-red-400/80 line-through truncate max-w-[100px]" title={String(f.from)}>{f.from}</span>
                                                                <ArrowRight className="w-3 h-3 text-slate-600 shrink-0 mt-0.5" />
                                                                <span className="text-green-400 truncate flex-1" title={String(f.to)}>{f.to}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <span className="text-xs text-slate-500 italic">Sem detalhes de campos alterados.</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductDatabase;
