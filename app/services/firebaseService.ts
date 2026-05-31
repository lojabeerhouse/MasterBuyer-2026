import { db } from "../firebaseConfig";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from "firebase/firestore";

const CHUNK_SIZE = 500;

// ─── Guarda centralizada (estado de módulo, vive por sessão) ─────────────────
// hydrated: chaves cujo load concluiu SEM erro nesta sessão
// lastCount: último tamanho conhecido por chave (para detectar shrink-para-vazio)
const hydrated = new Set<string>();
const lastCount = new Map<string, number>();

const countOf = (v: unknown): number => {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  return v == null ? 0 : 1;
};

// Fingerprint: count + sku/id do primeiro e último item + checksum de categoryId + checksum de stock
const loadedFingerprints = new Map<string, string>();

function getFingerprint<T>(data: T[]): string {
  const first = (data[0] as any)?.sku || (data[0] as any)?.id || '';
  const last  = (data[data.length - 1] as any)?.sku || (data[data.length - 1] as any)?.id || '';
  let catChecksum = 0;
  let stockChecksum = 0;
  let costChecksum = 0;
  let nameChecksum = 0;
  for (const item of data) {
    const catId = (item as any).categoryId || '';
    for (let i = 0; i < catId.length; i++) {
      catChecksum = (catChecksum * 31 + catId.charCodeAt(i)) & 0xffffffff;
    }
    stockChecksum = (stockChecksum * 31 + ((item as any).stock ?? 0)) & 0xffffffff;
    costChecksum = (costChecksum * 31 + (((item as any).priceCost ?? 0) * 100 | 0)) & 0xffffffff;
    const n = ((item as any).name || '');
    nameChecksum = (nameChecksum * 31 + (n.length > 0 ? n.charCodeAt(0) : 0) + (n.length > 4 ? n.charCodeAt(4) : 0)) & 0xffffffff;
  }
  return `${data.length}:${first}:${last}:${catChecksum}:${stockChecksum}:${costChecksum}:${nameChecksum}`;
}

export async function saveChunkedData<T>(
  userId: string,
  key: string,
  data: T[],
  opts?: { allowEmpty?: boolean }
): Promise<void> {
  // Invariante 1: load precisa ter concluído com sucesso nesta sessão
  if (!hydrated.has(key)) {
    console.warn(`[Firebase] 🛡️ saveChunked de "${key}" BLOQUEADO: load não confirmado nesta sessão.`);
    return;
  }
  // Invariante 2: não encolher de não-vazio para vazio sem autorização
  const prev = lastCount.get(key) ?? 0;
  const next = data.length;
  if (next === 0 && prev > 0 && !opts?.allowEmpty) {
    console.warn(`[Firebase] 🛡️ saveChunked de "${key}" BLOQUEADO: zeraria ${prev} item(ns).`);
    return;
  }

  const fp = getFingerprint(data);
  if (loadedFingerprints.get(`${userId}:${key}`) === fp) {
    console.log(`[Firebase] ⏭️ "${key}" inalterado, save ignorado`);
    return;
  }
  try {
    const chunks: T[][] = [];
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      chunks.push(data.slice(i, i + CHUNK_SIZE));
    }
    await setDoc(doc(db, 'users', userId, 'data', `${key}_meta`), {
      chunks: chunks.length,
      updatedAt: Date.now(),
    });
    await Promise.all(chunks.map((chunk, i) =>
      setDoc(doc(db, 'users', userId, 'data', `${key}_${i}`), {
        value: JSON.stringify(chunk),
        updatedAt: Date.now(),
      })
    ));
    loadedFingerprints.set(`${userId}:${key}`, fp);
    lastCount.set(key, next);
    console.log(`[Firebase] ✅ "${key}" salvo em ${chunks.length} chunk(s) (${data.length} itens)`);
  } catch (e: any) {
    console.error(`[Firebase] ❌ Erro ao salvar "${key}":`, e.code, e.message);
  }
}

export async function loadChunkedData<T>(userId: string, key: string, fallback: T[]): Promise<T[]> {
  try {
    const metaSnap = await getDoc(doc(db, 'users', userId, 'data', `${key}_meta`));
    if (!metaSnap.exists()) {
      // Fallback: compatibilidade com dados antigos salvos sem chunking
      return await loadUserData<T[]>(userId, key, fallback);
    }
    const { chunks } = metaSnap.data() as { chunks: number };
    const chunkDocs = await Promise.all(
      Array.from({ length: chunks }, (_, i) =>
        getDoc(doc(db, 'users', userId, 'data', `${key}_${i}`))
      )
    );
    const result: T[] = [];
    for (const snap of chunkDocs) {
      if (snap.exists()) result.push(...JSON.parse(snap.data().value));
    }
    loadedFingerprints.set(`${userId}:${key}`, getFingerprint(result));
    hydrated.add(key);              // ← só marca hidratado se NÃO lançou
    lastCount.set(key, result.length);
    console.log(`[Firebase] ✅ "${key}" carregado (${result.length} itens, ${chunks} chunks)`);
    return result;
  } catch (e: any) {
    console.error(`[Firebase] ❌ Erro ao carregar "${key}":`, e.code, e.message);
    return fallback;                 // retorna fallback, mas NÃO marca hidratado
  }
}

export const saveUserData = async <T>(
  userId: string,
  key: string,
  data: T,
  opts?: { allowEmpty?: boolean }
): Promise<void> => {
  // Invariante 1: load precisa ter concluído com sucesso nesta sessão
  if (!hydrated.has(key)) {
    console.warn(`[Firebase] 🛡️ save de "${key}" BLOQUEADO: load não confirmado nesta sessão.`);
    return;
  }
  // Invariante 2: não encolher de não-vazio para vazio sem autorização
  const prev = lastCount.get(key) ?? 0;
  const next = countOf(data);
  if (next === 0 && prev > 0 && !opts?.allowEmpty) {
    console.warn(`[Firebase] 🛡️ save de "${key}" BLOQUEADO: zeraria ${prev} item(ns).`);
    return;
  }
  try {
    console.log(`[Firebase] Salvando "${key}" uid=${userId.substring(0,8)}`);
    const ref = doc(db, "users", userId, "data", key);
    await setDoc(ref, { value: JSON.stringify(data), updatedAt: Date.now() });
    lastCount.set(key, next);
    console.log(`[Firebase] ✅ "${key}" salvo`);
  } catch (e: any) {
    console.error(`[Firebase] ❌ Erro ao salvar "${key}":`, e.code, e.message);
  }
};

export const loadUserData = async <T>(userId: string, key: string, fallback: T): Promise<T> => {
  try {
    console.log(`[Firebase] Carregando "${key}"...`);
    const ref = doc(db, "users", userId, "data", key);
    const snap = await getDoc(ref);
    const value = snap.exists()
      ? (JSON.parse(snap.data().value) as T)
      : fallback;
    if (snap.exists()) {
      console.log(`[Firebase] ✅ "${key}" encontrado`);
    } else {
      console.log(`[Firebase] ℹ️ "${key}" vazio, usando fallback`);
    }
    hydrated.add(key);                 // ← só marca hidratado se NÃO lançou
    lastCount.set(key, countOf(value));
    return value;
  } catch (e: any) {
    console.error(`[Firebase] ❌ Erro ao carregar "${key}":`, e.code, e.message);
    return fallback;                   // retorna fallback, mas NÃO marca hidratado
  }
};

// ─── Reset de sessão (chamado no logout) ─────────────────────────────────────
// Limpa o estado de módulo para que o próximo login comece do zero.
export const resetSessionGuards = (): void => {
  hydrated.clear();
  lastCount.clear();
  loadedFingerprints.clear();
  console.log(`[Firebase] 🔄 Guards de sessão resetados`);
};

// ─── Delta writes: coleções com 1 doc por item ───────────────────────────────
// Padrão escolhido para `suppliers` e `purchaseOrders`: cada item vira um doc
// em `users/{uid}/{collection}/{itemId}`. Escritas são por delta (upsert/delete
// do item específico), nunca overwrite do dataset inteiro. Mesma estratégia
// que `catalogs/` (que sobreviveu ao incidente de 2026-05-28).

interface DeltaItem { id: string }

async function loadDeltaCollection<T extends DeltaItem>(
  userId: string,
  collectionKey: string,
  legacyBlobKey: string,
): Promise<T[]> {
  try {
    const ref = collection(db, 'users', userId, collectionKey);
    const snap = await getDocs(ref);
    const result: T[] = [];
    snap.forEach(d => {
      const data = d.data();
      if (data?.value) {
        try {
          result.push(JSON.parse(data.value) as T);
        } catch (parseErr) {
          console.error(`[Firebase] ❌ Falha ao parsear doc ${collectionKey}/${d.id}:`, parseErr);
        }
      }
    });

    let final = result;

    // Migração one-shot: se a coleção nova está vazia, tenta o blob legado
    if (result.length === 0) {
      try {
        const legacyRef = doc(db, 'users', userId, 'data', legacyBlobKey);
        const legacySnap = await getDoc(legacyRef);
        if (legacySnap.exists()) {
          const legacy = JSON.parse(legacySnap.data().value) as T[];
          if (Array.isArray(legacy) && legacy.length > 0) {
            console.log(`[Firebase] 🔄 Migrando ${legacy.length} ${collectionKey} do blob legado → coleção delta`);
            const batch = writeBatch(db);
            legacy.forEach(item => {
              if (item?.id) {
                batch.set(doc(db, 'users', userId, collectionKey, item.id), {
                  value: JSON.stringify(item),
                  updatedAt: Date.now(),
                });
              }
            });
            await batch.commit();
            final = legacy;
            console.log(`[Firebase] ✅ Migração de ${collectionKey} concluída (blob legado preservado para rollback)`);
            // Marker de migração: permite saber quando e de onde foi migrado.
            // Não-bloqueante: falha no marker não compromete o load.
            setDoc(
              doc(db, 'users', userId, '_meta', 'migrations'),
              { [collectionKey]: { migratedAt: Date.now(), fromBlob: legacyBlobKey, count: final.length } },
              { merge: true },
            ).catch(() => {/* silencioso */});
          }
        }
      } catch (migErr: any) {
        console.error(`[Firebase] ⚠️ Falha na migração de ${collectionKey} (operação não-bloqueante):`, migErr?.message);
      }
    }

    hydrated.add(legacyBlobKey);
    lastCount.set(legacyBlobKey, final.length);
    console.log(`[Firebase] ✅ ${collectionKey} carregado: ${final.length} item(ns)`);
    return final;
  } catch (e: any) {
    console.error(`[Firebase] ❌ Erro ao carregar ${collectionKey}:`, e.code, e.message);
    return [];
  }
}

async function upsertDeltaItems<T extends DeltaItem>(
  userId: string,
  collectionKey: string,
  hydrationKey: string,
  items: T[],
): Promise<void> {
  if (items.length === 0) return;
  if (!hydrated.has(hydrationKey)) {
    console.warn(`[Firebase] 🛡️ upsert ${collectionKey} BLOQUEADO: load não confirmado nesta sessão.`);
    return;
  }
  try {
    const batch = writeBatch(db);
    items.forEach(item => {
      batch.set(doc(db, 'users', userId, collectionKey, item.id), {
        value: JSON.stringify(item),
        updatedAt: Date.now(),
      });
    });
    await batch.commit();
    console.log(`[Firebase] ✅ ${items.length} ${collectionKey} upserted`);
  } catch (e: any) {
    console.error(`[Firebase] ❌ Erro ao upsert ${collectionKey}:`, e.code, e.message);
  }
}

async function deleteDeltaItems(
  userId: string,
  collectionKey: string,
  hydrationKey: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  if (!hydrated.has(hydrationKey)) {
    console.warn(`[Firebase] 🛡️ delete ${collectionKey} BLOQUEADO: load não confirmado nesta sessão.`);
    return;
  }
  try {
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'users', userId, collectionKey, id)));
    await batch.commit();
    const prev = lastCount.get(hydrationKey) ?? 0;
    lastCount.set(hydrationKey, Math.max(0, prev - ids.length));
    console.log(`[Firebase] ✅ ${ids.length} ${collectionKey} deletados`);
  } catch (e: any) {
    console.error(`[Firebase] ❌ Erro ao deletar ${collectionKey}:`, e.code, e.message);
  }
}

// ─── API pública: suppliers ──────────────────────────────────────────────────
export const loadAllSuppliers = <T extends DeltaItem>(uid: string) =>
  loadDeltaCollection<T>(uid, 'suppliers', 'suppliers');
export const upsertSuppliers = <T extends DeltaItem>(uid: string, items: T[]) =>
  upsertDeltaItems<T>(uid, 'suppliers', 'suppliers', items);
export const deleteSuppliers = (uid: string, ids: string[]) =>
  deleteDeltaItems(uid, 'suppliers', 'suppliers', ids);

// ─── API pública: purchaseOrders ─────────────────────────────────────────────
export const loadAllPurchaseOrders = <T extends DeltaItem>(uid: string) =>
  loadDeltaCollection<T>(uid, 'purchaseOrders', 'purchaseOrders');
export const upsertPurchaseOrders = <T extends DeltaItem>(uid: string, items: T[]) =>
  upsertDeltaItems<T>(uid, 'purchaseOrders', 'purchaseOrders', items);
export const deletePurchaseOrders = (uid: string, ids: string[]) =>
  deleteDeltaItems(uid, 'purchaseOrders', 'purchaseOrders', ids);
