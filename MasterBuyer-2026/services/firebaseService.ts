import { db } from "../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";

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
