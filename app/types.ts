
export interface ProductQuote {
  sku: string;
  name: string;
  price: number; // Price of the specific item/pack found in the list
  unit: string;
  packQuantity: number; // How many units are in this price? (e.g., 1, 12, 18)
  unitPrice: number; // Calculated price per single unit
  priceStrategy?: 'pack' | 'unit'; // 'pack' = price is total for the box; 'unit' = price is for single unit
  isVerified?: boolean; // If true, the item is considered identified/ready
  isReprocessed?: boolean; // If true, rule was applied automatically, needs verification
}

export interface QuoteBatch {
  id: string;
  timestamp: number;
  sourceType: 'text' | 'file';
  fileName?: string;
  rawContent?: string;
  status: 'pending' | 'analyzing' | 'completed' | 'error';
  items: ProductQuote[];
  errorMessage?: string;
}

export interface PackRule {
  id: string;
  term: string; // "Longneck", "Lata", "269ml"
  quantity: number; // 24, 12, 15
}

export interface NamingRule {
  id: string;
  terms: string[]; // Keywords that MUST exist (e.g. ["CERVEJA", "350ML"])
  category?: string; // Prefix to force (e.g. "CERVEJA")
  suffix?: string; // Suffix to force (e.g. "LATA")
}

export interface Supplier {
  id: string;
  name: string;
  isEnabled: boolean;
  location?: string;
  quotes: QuoteBatch[];
  blacklist?: string[]; // Names of products to automatically ignore/delete
  packRules?: PackRule[]; // Rules to auto-correct pack quantities
}

export interface SalesRecord {
  sku: string;
  productName: string;
  quantitySold: number;
  date: string;
}

export interface ForecastItem {
  sku: string;
  name: string;
  currentStock?: number;
  suggestedQty: number; // Total units needed
  baseQty: number;
  unit: string;
  inflationPercent: number;
  totalSold: number; // Historical volume for sorting (Curve A)
}

export interface ProductMapping {
    supplierProductNameNormalized: string; // The normalized name coming from the supplier quote
    targetSku: string; // The SKU in your forecast/sales system
}

export interface ComparisonResult {
  sku: string;
  name: string;
  qtyNeeded: number;
  bestSupplierId: string | null;
  bestUnitPrice: number;
  details: {
    supplierId: string;
    supplierName: string;
    packPrice: number; // Price of the pack (e.g., 35.00)
    packQuantity: number; // Size (e.g., 12)
    unitPrice: number; // Price per unit (e.g., 2.91)
    totalCost: number; // Cost to fulfill demand
    packsNeeded: number; // Integer number of packs to buy
    isBest: boolean;
  }[];
}

export interface CartItem {
  id: string;
  sku: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  packQuantity: number; // Size of pack (e.g., 12)
  packPrice: number; // Cost per pack
  quantityToBuy: number; // Number of packs/units ordered
  totalCost: number;
}

export interface PurchaseOrder {
  supplierId: string;
  supplierName: string;
  items: CartItem[];
  totalValue: number;
}

export interface MasterProduct {
  id: string; // From "ID" column
  sku: string; // From "Código"
  name: string; // From "Descrição"
  unit: string; // From "Unidade"
  ncm: string; // From "NCM"
  priceSell: number; // From "Preço"
  priceCost: number; // From "Preço de custo"
  stock: number; // From "Estoque"
  ean: string; // From "GTIN/EAN"
  supplier: string; // From "Fornecedor"
  
  // Extended Fields
  brand?: string; // "Marca"
  category?: string; // "Categoria do produto" (Coluna BF)
  tags?: string; // "Grupo de Tags/Tags" (Antiga categoria)
  productGroup?: string; // "Grupo de produtos" (Coluna AL)
  department?: string; // "Departamento"
  netWeight?: number; // "Peso líquido (Kg)"
  grossWeight?: number; // "Peso bruto (Kg)"
  minStock?: number; // "Estoque mínimo"
  maxStock?: number; // "Estoque máximo"
  width?: number; // "Largura do produto"
  height?: number; // "Altura do Produto"
  depth?: number; // "Profundidade do produto"
  image?: string; // "URL Imagens Externas"
  externalLink?: string; // "Link Externo"
  observations?: string; // "Observações"
  status?: string; // "Situação"
  origin?: string; // "Origem"
  expiryDate?: string; // "Data Validade"
  location?: string; // "Localização"
  ipiFixed?: number; // "Valor IPI fixo"
  crossDocking?: number; // "Cross-Docking"
  gtinPackaging?: string; // "GTIN/EAN da Embalagem"
  productionType?: string; // "Tipo Produção"
  condition?: string; // "Condição do Produto"
  freeShipping?: string; // "Frete Grátis"
}
// ─── NOTIFICATION SYSTEM ────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: 'attention' | 'console';
  title: string;
  message: string;
  timestamp: number;
  resolved: boolean;

  // Context
  supplierId?: string;
  supplierName?: string;
  batchId?: string;

  // For duplicate resolution
  payload?: DuplicatePayload;
}

export interface DuplicatePayload {
  productName: string;
  existing: {
    batchId: string;
    supplierId: string;
    supplierName: string;
    unitPrice: number;
    packPrice: number;
    packQuantity: number;
    timestamp: number;
  };
  incoming: {
    batchId: string;
    supplierId: string;
    supplierName: string;
    unitPrice: number;
    packPrice: number;
    packQuantity: number;
    timestamp: number;
  };
  normalizedKey: string; // key used in priceHistory
}

// ─── PRICE HISTORY ──────────────────────────────────────────────────────────

export interface PriceRecord {
  id: string;           // uuid
  date: number;         // timestamp
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  packPrice: number;
  packQuantity: number;
  batchId: string;      // reference to original QuoteBatch
  sourceType: 'text' | 'file';
}

export interface ProductPriceHistory {
  // Key in Firestore: users/{uid}/priceHistory/{normalizedKey}
  normalizedKey: string;  // normalized product name or SKU
  productName: string;    // display name (last seen)
  masterSku?: string;     // linked SKU if mapped
  records: PriceRecord[];
}
// ─── SUPPLIER CATALOG ────────────────────────────────────────────────────────

/** Modo de validade de preços por fornecedor */
export type PriceValidityMode = 'global' | 'frozen' | 'custom';

/** Uma entrada de preço no histórico do produto do fornecedor */
export interface SupplierPriceEntry {
  date: number;           // timestamp da cotação
  batchId: string;        // referência ao QuoteBatch
  unitPrice: number;      // preço por unidade
  packPrice: number;      // preço da embalagem
  packQuantity: number;   // unidades na embalagem
}

/** Produto no catálogo de um fornecedor */
export interface SupplierCatalogProduct {
  id: string;                         // chave normalizada do nome ou SKU
  supplierSku?: string;               // SKU do fornecedor (se vier na cotação)
  ean?: string;                       // EAN/GTIN se disponível
  name: string;                       // nome como veio na última cotação
  nameNormalized: string;             // nome normalizado para matching
  packQuantity: number;               // último lote conhecido
  priceHistory: SupplierPriceEntry[]; // histórico completo de preços
  lastSeenDate: number;               // última vez que apareceu numa cotação
  lastUnitPrice: number;              // último preço unitário
  lastPackPrice: number;              // último preço de embalagem

  // Link com MEU catálogo
  masterSku?: string;           // SKU do meu produto linkado
  masterProductName?: string;   // nome do meu produto (cache para display)
  masterTags?: string;          // tags herdadas do meu produto
  masterCategory?: string;      // categoria herdada do meu produto
  linkConfirmed?: boolean;      // true = usuário confirmou o link manualmente
  linkSuggestion?: string;      // SKU sugerido automaticamente (aguardando confirmação)
  linkSuggestionScore?: number; // % de similaridade da sugestão
}

/** Catálogo completo de um fornecedor */
export interface SupplierCatalog {
  supplierId: string;
  supplierName: string;
  products: SupplierCatalogProduct[];

  // Configuração de validade de preços deste fornecedor
  priceValidityMode: PriceValidityMode;
  priceValidityDays?: number; // só usado quando mode = 'custom'
  updatedAt: number;
}

/** Configuração global de validade de preços */
export interface PriceValidityConfig {
  globalDays: number; // padrão: 7 dias
}