import { db } from "../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";

const CHUNK_SIZE = 500;

// Fingerprint leve: count + sku/id do primeiro e último item
const loadedFingerprints = new Map<string, string>();

function getFingerprint<T>(data: T[]): string {
  const first = (data[0] as any)?.sku || (data[0] as any)?.id || '';
  const last  = (data[data.length - 1] as any)?.sku || (data[data.length - 1] as any)?.id || '';
  return `${data.length}:${first}:${last}`;
}

export async function saveChunkedData<T>(userId: string, key: string, data: T[]): Promise<void> {
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
    console.log(`[Firebase] ✅ "${key}" carregado (${result.length} itens, ${chunks} chunks)`);
    return result;
  } catch (e: any) {
    console.error(`[Firebase] ❌ Erro ao carregar "${key}":`, e.code, e.message);
    return fallback;
  }
}

export const saveUserData = async (userId: string, key: string, data: unknown): Promise<void> => {
  try {
    console.log(`[Firebase] Salvando "${key}" uid=${userId.substring(0,8)}`);
    const ref = doc(db, "users", userId, "data", key);
    await setDoc(ref, { value: JSON.stringify(data), updatedAt: Date.now() });
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
    if (snap.exists()) {
      console.log(`[Firebase] ✅ "${key}" encontrado`);
      return JSON.parse(snap.data().value) as T;
    }
    console.log(`[Firebase] ℹ️ "${key}" vazio, usando fallback`);
    return fallback;
  } catch (e: any) {
    console.error(`[Firebase] ❌ Erro ao carregar "${key}":`, e.code, e.message);
    return fallback;
  }
};
