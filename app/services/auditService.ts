import { db } from "../firebaseConfig";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { ProductAuditEntry, ProductAuditLog } from "../types";

export async function appendAuditEntry(
  uid: string,
  productId: string,
  sku: string,
  entry: ProductAuditEntry
): Promise<void> {
  if (!uid || !productId) return;
  
  try {
    const ref = doc(db, 'users', uid, 'productAuditLog', productId);
    const snap = await getDoc(ref);
    
    if (snap.exists()) {
      // Append and slice to max 100 entries to prevent infinite growth
      const currentData = snap.data() as ProductAuditLog;
      const newChanges = [entry, ...(currentData.changes || [])].slice(0, 100);
      
      await updateDoc(ref, {
        sku: sku,
        changes: newChanges
      });
    } else {
      // Create new doc
      const newLog: ProductAuditLog = {
        productId,
        sku,
        changes: [entry]
      };
      await setDoc(ref, newLog);
    }
  } catch (e) {
    console.error("[AuditService] Erro ao salvar log de auditoria do produto:", e);
  }
}

export async function loadProductAuditLog(
  uid: string,
  productId: string
): Promise<ProductAuditEntry[]> {
  if (!uid || !productId) return [];
  
  try {
    const ref = doc(db, 'users', uid, 'productAuditLog', productId);
    const snap = await getDoc(ref);
    
    if (snap.exists()) {
      const data = snap.data() as ProductAuditLog;
      return data.changes || [];
    }
    return [];
  } catch (e) {
    console.error("[AuditService] Erro ao carregar log de auditoria do produto:", e);
    return [];
  }
}
