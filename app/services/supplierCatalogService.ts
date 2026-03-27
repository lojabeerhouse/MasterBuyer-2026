import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import {
  SupplierCatalog,
  SupplierCatalogProduct,
  SupplierPriceEntry,
  PriceValidityMode,
  MasterProduct,
  QuoteBatch,
} from '../types';

// ─── NORMALIZAÇÃO ────────────────────────────────────────────────────────────

export const normalizeProductName = (name: string): string =>
  name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Normalização usada como chave em productMappings (mesma lógica do addMapping no App.tsx) */
export const normForMapping = (name: string): string =>
  name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

export const makeProductId = (name: string): string =>
  normalizeProductName(name).toLowerCase().replace(/\s+/g, '_');

// ─── SIMILARIDADE (Levenshtein) ──────────────────────────────────────────────

const levenshtein = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
};

export const similarityScore = (a: string, b: string): number => {
  const na = normalizeProductName(a);
  const nb = normalizeProductName(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - levenshtein(na, nb) / maxLen) * 100);
};

/**
 * Similaridade inteligente: máximo entre Levenshtein puro, Token-Sort e Token-Set.
 * - Token-Sort: ordena palavras antes de comparar → ignora ordem dos tokens
 * - Token-Set: compara tokens comuns vs tokens exclusivos → premia conteúdo compartilhado
 * Resultado: "Cerveja 330ml Heineken" score mais alto com "CERVEJA LongNeck Heineken 330ml"
 * do que com "CERVEJA LATA HEINEKEN 350ML" mesmo que a ordem clássica favoreça o segundo.
 */
export const smartSimilarityScore = (a: string, b: string): number => {
  const na = normalizeProductName(a);
  const nb = normalizeProductName(b);

  // 1. Levenshtein tradicional
  const rawScore = similarityScore(a, b);

  // 2. Token-Sort: ordena tokens alfabeticamente antes de comparar
  const tokensA = na.split(' ').filter(Boolean).sort();
  const tokensB = nb.split(' ').filter(Boolean).sort();
  const sortedA = tokensA.join(' ');
  const sortedB = tokensB.join(' ');
  const maxSorted = Math.max(sortedA.length, sortedB.length);
  const sortedScore = maxSorted === 0 ? 100 : Math.round((1 - levenshtein(sortedA, sortedB) / maxSorted) * 100);

  // 3. Token-Set: separa tokens em comum dos exclusivos de cada lado
  const setB = new Set(tokensB);
  const intersection = tokensA.filter(t => setB.has(t)).sort();
  const onlyA = tokensA.filter(t => !setB.has(t)).sort();
  const setA = new Set(tokensA);
  const onlyB = tokensB.filter(t => !setA.has(t)).sort();
  const base = intersection.join(' ');
  const s1 = [base, ...onlyA].filter(Boolean).join(' ');
  const s2 = [base, ...onlyB].filter(Boolean).join(' ');
  const maxSet = Math.max(s1.length, s2.length, 1);
  const setScore = Math.round((1 - levenshtein(s1, s2) / maxSet) * 100);

  return Math.max(rawScore, sortedScore, setScore);
};

/** Retorna os N melhores matches do meu catálogo para um produto do fornecedor */
export const findMasterProductMatches = (
  productName: string,
  masterProducts: MasterProduct[],
  topN = 3
): { sku: string; name: string; score: number }[] =>
  masterProducts
    .map(mp => ({
      sku: mp.sku,
      name: mp.name,
      score: smartSimilarityScore(productName, mp.name),
    }))
    .filter(m => m.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

// ─── FIRESTORE ───────────────────────────────────────────────────────────────

export const saveCatalog = async (uid: string, catalog: SupplierCatalog): Promise<void> => {
  try {
    const ref = doc(db, 'users', uid, 'catalogs', catalog.supplierId);
    // JSON round-trip remove campos undefined (Firestore não aceita undefined)
    const clean = JSON.parse(JSON.stringify(catalog));
    await setDoc(ref, clean);
  } catch (e) {
    console.error('[Catalog] Erro ao salvar:', e);
  }
};

export const loadCatalog = async (
  uid: string,
  supplierId: string
): Promise<SupplierCatalog | null> => {
  try {
    const ref = doc(db, 'users', uid, 'catalogs', supplierId);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as SupplierCatalog) : null;
  } catch (e) {
    console.error('[Catalog] Erro ao carregar:', e);
    return null;
  }
};

export const loadAllCatalogs = async (uid: string): Promise<SupplierCatalog[]> => {
  try {
    const col = collection(db, 'users', uid, 'catalogs');
    const snap = await getDocs(col);
    return snap.docs.map(d => d.data() as SupplierCatalog);
  } catch (e) {
    console.error('[Catalog] Erro ao carregar todos:', e);
    return [];
  }
};

// ─── PROCESSAR COTAÇÃO → CATÁLOGO ────────────────────────────────────────────

/**
 * Chamado toda vez que um batch é completado.
 * Atualiza o catálogo do fornecedor com os novos produtos e histórico de preços.
 */
export const processBatchIntoCatalog = async (
  uid: string,
  batch: QuoteBatch,
  supplierId: string,
  supplierName: string,
  masterProducts: MasterProduct[]
): Promise<{ catalog: SupplierCatalog; newProducts: number; updatedProducts: number }> => {
  const existing = await loadCatalog(uid, supplierId);

  const catalog: SupplierCatalog = existing ?? {
    supplierId,
    supplierName,
    products: [],
    priceValidityMode: 'global',
    updatedAt: Date.now(),
  };

  let newProducts = 0;
  let updatedProducts = 0;

  for (const item of batch.items) {
    if (!item.name || item.unitPrice <= 0) continue;

    const nameNormalized = normalizeProductName(item.name);
    const productId = makeProductId(item.name);

    const priceEntry: SupplierPriceEntry = {
      date: batch.timestamp,
      batchId: batch.id,
      unitPrice: item.unitPrice,
      packPrice: item.price,
      packQuantity: item.packQuantity,
    };

    const existingIdx = catalog.products.findIndex(p => p.id === productId);

    if (existingIdx >= 0) {
      const prod = catalog.products[existingIdx];
      const existingHistoryIdx = prod.priceHistory.findIndex(e => e.batchId === batch.id);
      if (existingHistoryIdx >= 0) {
        // Re-save do mesmo batch: substitui a entrada existente (permite corrigir priceStrategy)
        prod.priceHistory[existingHistoryIdx] = priceEntry;
      } else {
        prod.priceHistory = [priceEntry, ...prod.priceHistory].slice(0, 60); // max 60 entradas
      }
      // Sempre atualiza os valores mais recentes
      prod.lastSeenDate = batch.timestamp;
      prod.lastUnitPrice = item.unitPrice;
      prod.lastPackPrice = item.price;
      prod.packQuantity = item.packQuantity;
      prod.name = item.name;
      if (item.sku && item.sku !== 'S/N') prod.supplierSku = item.sku;
      catalog.products[existingIdx] = prod;
      updatedProducts++;
    } else {
      const newProduct: SupplierCatalogProduct = {
        id: productId,
        supplierSku: item.sku && item.sku !== 'S/N' ? item.sku : undefined,
        name: item.name,
        nameNormalized,
        packQuantity: item.packQuantity,
        priceHistory: [priceEntry],
        lastSeenDate: batch.timestamp,
        lastUnitPrice: item.unitPrice,
        lastPackPrice: item.price,
        linkConfirmed: false,
      };

      // Tenta match automático com o catálogo master
      if (masterProducts.length > 0) {
        const matches = findMasterProductMatches(item.name, masterProducts, 1);
        if (matches.length > 0 && matches[0].score >= 70) {
          newProduct.linkSuggestion = matches[0].sku;
          newProduct.linkSuggestionScore = matches[0].score;
          newProduct.masterProductName = matches[0].name;
        }
      }

      catalog.products.push(newProduct);
      newProducts++;
    }
  }

  catalog.updatedAt = Date.now();
  await saveCatalog(uid, catalog);

  return { catalog, newProducts, updatedProducts };
};

// ─── LINK / UNLINK ───────────────────────────────────────────────────────────

export const confirmProductLink = async (
  uid: string,
  catalog: SupplierCatalog,
  productId: string,
  masterProduct: MasterProduct
): Promise<SupplierCatalog> => {
  const updated: SupplierCatalog = {
    ...catalog,
    products: catalog.products.map(p =>
      p.id === productId
        ? {
            ...p,
            masterSku: masterProduct.sku,
            masterProductName: masterProduct.name,
            masterTags: masterProduct.tags,
            masterCategory: masterProduct.category,
            linkConfirmed: true,
            linkSuggestion: undefined,
            linkSuggestionScore: undefined,
          }
        : p
    ),
  };
  await saveCatalog(uid, updated);
  return updated;
};

export const removeProductLink = async (
  uid: string,
  catalog: SupplierCatalog,
  productId: string
): Promise<SupplierCatalog> => {
  const updated: SupplierCatalog = {
    ...catalog,
    products: catalog.products.map(p =>
      p.id === productId
        ? {
            ...p,
            masterSku: undefined,
            masterProductName: undefined,
            masterTags: undefined,
            masterCategory: undefined,
            linkConfirmed: false,
          }
        : p
    ),
  };
  await saveCatalog(uid, updated);
  return updated;
};

export const rejectLinkSuggestion = async (
  uid: string,
  catalog: SupplierCatalog,
  productId: string
): Promise<SupplierCatalog> => {
  const updated: SupplierCatalog = {
    ...catalog,
    products: catalog.products.map(p =>
      p.id === productId
        ? { ...p, linkSuggestion: undefined, linkSuggestionScore: undefined, masterProductName: undefined }
        : p
    ),
  };
  await saveCatalog(uid, updated);
  return updated;
};

// ─── VALIDADE DE PREÇOS ──────────────────────────────────────────────────────

/** Retorna a entrada de preço válida de acordo com o modo de validade */
export const getValidPrice = (
  product: SupplierCatalogProduct,
  mode: PriceValidityMode,
  validityDays: number
): SupplierPriceEntry | null => {
  if (product.priceHistory.length === 0) return null;
  if (mode === 'frozen') return product.priceHistory[0];
  const cutoff = Date.now() - validityDays * 24 * 60 * 60 * 1000;
  return product.priceHistory.find(e => e.date >= cutoff) ?? null;
};
