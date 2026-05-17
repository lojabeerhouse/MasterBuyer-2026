import { AppLog, LogLevel } from '../types';
import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// Cache local em memória (epêmero por sessão para sucessos, persistente via Firestore para erros)
let logBuffer: AppLog[] = [];
let userId: string | null = null;
let lastSyncTimestamp = 0;
const SYNC_INTERVAL_MS = 60000; // 1 minuto

type LogListener = (logs: AppLog[]) => void;
const listeners: Set<LogListener> = new Set();

/** Inicializa o logger com o ID do usuário */
export const initLogger = (uid: string) => {
  userId = uid;
  // Inicia o loop de sincronização
  setInterval(syncErrorLogs, SYNC_INTERVAL_MS);
};

/** Adiciona um listener para mudanças no buffer de logs */
export const addLogListener = (listener: LogListener) => {
  listeners.add(listener);
  listener([...logBuffer]); // Envia o estado atual imediatamente
  return () => {
    listeners.delete(listener);
  };
};

const notifyListeners = () => {
  const currentLogs = [...logBuffer];
  listeners.forEach(l => l(currentLogs));
};

/** Função central de log */
const log = (level: LogLevel, message: string, source?: string, hint?: string) => {
  const newLog: AppLog = {
    id: crypto.randomUUID(),
    level,
    message,
    source,
    hint,
    timestamp: Date.now(),
    read: false,
  };

  logBuffer = [newLog, ...logBuffer].slice(0, 500); // Mantém apenas os últimos 500 logs em memória
  notifyListeners();

  // Se for erro, agendamos um sync (ou o loop cuidará disso)
  // logs de sucesso/info/warn ficam apenas na memória local para esta sessão
};

export const appLogger = {
  info: (msg: string, src?: string) => log('info', msg, src),
  success: (msg: string, src?: string) => log('success', msg, src),
  warn: (msg: string, src?: string, hint?: string) => log('warn', msg, src, hint),
  error: (msg: string, src?: string, hint?: string) => log('error', msg, src, hint),
  clear: () => {
    logBuffer = [];
    notifyListeners();
  }
};

/** Sincroniza apenas logs de erro com o Firestore */
async function syncErrorLogs() {
  if (!userId) return;

  const errorLogs = logBuffer.filter(l => l.level === 'error' && l.timestamp > lastSyncTimestamp);
  if (errorLogs.length === 0) return;

  try {
    const ref = doc(db, 'users', userId, 'data', 'error_logs');
    const snap = await getDoc(ref);
    
    let existingLogs: AppLog[] = [];
    if (snap.exists()) {
      existingLogs = JSON.parse(snap.data().value || '[]');
    }

    // Unifica e mantém apenas os últimos 200 erros no banco
    const merged = [...errorLogs, ...existingLogs].slice(0, 200);
    
    await setDoc(ref, {
      value: JSON.stringify(merged),
      updatedAt: Date.now()
    });

    lastSyncTimestamp = Date.now();
    console.log(`[Logger] 🚀 ${errorLogs.length} erros sincronizados com o banco.`);
  } catch (e) {
    console.error('[Logger] Erro ao sincronizar logs:', e);
  }
}
