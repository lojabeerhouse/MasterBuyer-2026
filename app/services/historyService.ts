import { db } from '../firebaseConfig';
import {
  doc, getDoc, setDoc, collection,
  getDocs, deleteDoc
} from 'firebase/firestore';
import { AppNotification, PriceRecord, ProductPriceHistory, DuplicatePayload } from '../types';
import { ProductQuote, QuoteBatch, Supplier } from '../types';

// ─── HELPERS ────────────────────────────────────────────────────────────────

/** Normaliza nome do produto para usar como chave de histórico */
export const normalizeProductKey = (name: string): string =>
  name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Verifica se dois registros são da mesma semana */
const isSameWeek = (t1: number, t2: number): boolean =>
  Math.abs(t1 - t2) < ONE_WEEK_MS;

// ─── PRICE HISTORY ──────────────────────────────────────────────────────────

export const loadPriceHistory = async (
  uid: string,
  normalizedKey: string
): Promise<ProductPriceHistory | null> => {
  try {
    const ref = doc(db, 'users', uid, 'priceHistory', normalizedKey);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as ProductPriceHistory) : null;
  } catch (e) {
    console.error('Erro ao carregar histórico:', e);
    return null;
  }
};

export const savePriceHistory = async (
  uid: string,
  history: ProductPriceHistory
): Promise<void> => {
  try {
    const ref = doc(db, 'users', uid, 'priceHistory', history.normalizedKey);
    const clean = JSON.parse(JSON.stringify(history));
    await setDoc(ref, clean);
  } catch (e) {
    console.error('Erro ao salvar histórico:', e);
  }
};

export const loadAllPriceHistories = async (
  uid: string
): Promise<ProductPriceHistory[]> => {
  try {
    const col = collection(db, 'users', uid, 'priceHistory');
    const snap = await getDocs(col);
    return snap.docs.map(d => d.data() as ProductPriceHistory);
  } catch (e) {
    console.error('Erro ao carregar históricos:', e);
    return [];
  }
};

// ─── NOTIFICATIONS ──────────────────────────────────────────────────────────

export const saveNotifications = async (
  uid: string,
  notifications: AppNotification[]
): Promise<void> => {
  try {
    const ref = doc(db, 'users', uid, 'data', 'notifications');
    await setDoc(ref, { value: JSON.stringify(notifications), updatedAt: Date.now() });
  } catch (e) {
    console.error('Erro ao salvar notificações:', e);
  }
};

export const loadNotifications = async (
  uid: string
): Promise<AppNotification[]> => {
  try {
    const ref = doc(db, 'users', uid, 'data', 'notifications');
    const snap = await getDoc(ref);
    if (!snap.exists()) return [];
    const all: AppNotification[] = JSON.parse(snap.data().value || '[]');

    // Auto-remove console notifications older than 24h
    const now = Date.now();
    const cutoff = 24 * 60 * 60 * 1000;
    return all.filter(n =>
      n.type === 'attention' || (now - n.timestamp) < cutoff
    );
  } catch (e) {
    return [];
  }
};

// ─── CORE: PROCESS BATCH INTO HISTORY + NOTIFICATIONS ───────────────────────

export interface ProcessBatchResult {
  newNotifications: AppNotification[];
  updatedHistories: ProductPriceHistory[];
}

/**
 * Processa um batch de cotação recém-completado:
 * - Para cada item, verifica duplicatas na mesma semana
 * - Se duplicata → cria notificação de ATENÇÃO (não grava ainda)
 * - Se novo → grava direto no histórico + notificação de console
 */
export const processBatchIntoHistory = async (
  uid: string,
  batch: QuoteBatch,
  supplier: Supplier,
  productMappings: { supplierProductNameNormalized: string; targetSku: string }[],
  existingNotifications: AppNotification[]
): Promise<ProcessBatchResult> => {
  const newNotifications: AppNotification[] = [];
  const updatedHistories: ProductPriceHistory[] = [];

  for (const item of batch.items) {
    const normalizedKey = normalizeProductKey(item.name);

    // Check if there's a master SKU mapping
    const itemNormForMapping = item.name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const mapping = productMappings.find(m => m.supplierProductNameNormalized === itemNormForMapping);
    const masterSku = mapping?.targetSku;

    // Load existing history
    const history = await loadPriceHistory(uid, normalizedKey) ?? {
      normalizedKey,
      productName: item.name,
      masterSku,
      records: [],
    };

    // Update masterSku if now mapped
    if (masterSku && !history.masterSku) history.masterSku = masterSku;

    // Check for duplicate: same supplier, same week
    const existingRecord = history.records.find(
      r => r.supplierId === supplier.id && isSameWeek(r.date, batch.timestamp)
    );

    if (existingRecord) {
      // Only notify if price changed
      if (Math.abs(existingRecord.unitPrice - item.unitPrice) > 0.001) {
        const shortName = item.name.substring(0, 10);
        const dateStr = new Date(batch.timestamp).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', year: '2-digit'
        });
        const timeStr = new Date(batch.timestamp).toLocaleTimeString('pt-BR', {
          hour: '2-digit', minute: '2-digit'
        });

        const notification: AppNotification = {
          id: crypto.randomUUID(),
          type: 'attention',
          title: `Duplicidade: "${shortName}"`,
          message: `Produto: "${shortName}" ${dateStr} - ${timeStr} [${supplier.name}] — VERIFIQUE QUAL MANTER CLICANDO AQUI!`,
          timestamp: Date.now(),
          resolved: false,
          supplierId: supplier.id,
          supplierName: supplier.name,
          batchId: batch.id,
          payload: {
            productName: item.name,
            normalizedKey,
            existing: {
              batchId: existingRecord.batchId,
              supplierId: existingRecord.supplierId,
              supplierName: existingRecord.supplierName,
              unitPrice: existingRecord.unitPrice,
              packPrice: existingRecord.packPrice,
              packQuantity: existingRecord.packQuantity,
              timestamp: existingRecord.date,
            },
            incoming: {
              batchId: batch.id,
              supplierId: supplier.id,
              supplierName: supplier.name,
              unitPrice: item.unitPrice,
              packPrice: item.price,
              packQuantity: item.packQuantity,
              timestamp: batch.timestamp,
            },
          } as DuplicatePayload,
        };
        newNotifications.push(notification);
      }
      // Skip writing to history — awaiting user resolution
      continue;
    }

    // No duplicate — write directly to history
    const newRecord: PriceRecord = {
      id: crypto.randomUUID(),
      date: batch.timestamp,
      supplierId: supplier.id,
      supplierName: supplier.name,
      unitPrice: item.unitPrice,
      packPrice: item.price,
      packQuantity: item.packQuantity,
      batchId: batch.id,
      sourceType: batch.sourceType,
    };

    history.records.push(newRecord);
    updatedHistories.push(history);

    // Save to Firestore
    await savePriceHistory(uid, history);
  }

  // Console notification for batch success
  const dateStr = new Date(batch.timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit'
  });
  const timeStr = new Date(batch.timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit'
  });
  const batchName = batch.fileName
    ? `"${batch.fileName.substring(0, 20)}"`
    : `"Listagem ${new Date(batch.timestamp).toLocaleDateString('pt-BR')}"`;

  newNotifications.push({
    id: crypto.randomUUID(),
    type: 'console',
    title: `${batchName} processada`,
    message: `${batchName} analisada com sucesso em ${dateStr} - ${timeStr} [${supplier.name}]`,
    timestamp: Date.now(),
    resolved: true,
    supplierId: supplier.id,
    supplierName: supplier.name,
    batchId: batch.id,
  });

  return { newNotifications, updatedHistories };
};

/**
 * Resolve uma duplicata: mantém um dos dois registros
 * keepWhich: 'existing' | 'incoming'
 */
export const resolveDuplicate = async (
  uid: string,
  notification: AppNotification,
  keepWhich: 'existing' | 'incoming'
): Promise<void> => {
  if (!notification.payload) return;
  const payload = notification.payload as DuplicatePayload;
  const { normalizedKey, existing, incoming, productName } = payload;

  const history = await loadPriceHistory(uid, normalizedKey);
  if (!history) return;

  if (keepWhich === 'incoming') {
    // Remove existing record, add incoming
    history.records = history.records.filter(
      r => !(r.supplierId === existing.supplierId && r.batchId === existing.batchId)
    );
    history.records.push({
      id: crypto.randomUUID(),
      date: incoming.timestamp,
      supplierId: incoming.supplierId,
      supplierName: incoming.supplierName,
      unitPrice: incoming.unitPrice,
      packPrice: incoming.packPrice,
      packQuantity: incoming.packQuantity,
      batchId: incoming.batchId,
      sourceType: 'text',
    });
  }
  // If 'existing', keep as-is (incoming is discarded)

  await savePriceHistory(uid, history);
};
