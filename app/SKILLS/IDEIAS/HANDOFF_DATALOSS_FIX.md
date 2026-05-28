# Handoff — Data Loss: Diagnóstico, Recuperação e Fix

**Data do incidente:** 2026-05-28 ~15h07 BRT
**Status:** ❌ `suppliers` perdido | ✅ `masterProducts` intacto | ✅ `supplierCatalogs` intactos | ✅ `purchaseOrders` intactos

---

## 1. O que aconteceu

**Timeline:**
1. Sessão 5 modificou `app/types.ts` (arquivo amplamente importado)
2. Vite detectou mudança → disparou full page reload (não HMR parcial)
3. App recarregou, `loadAllData` executou novamente
4. `loadUserData(uid, 'suppliers', [])` encontrou erro transient do Firestore (timeout ou erro de rede durante o reload)
5. `loadUserData` **capturou silenciosamente** o erro e retornou o fallback `[]`
6. `setIsLoaded(true)` disparou normalmente (incondicional — não verifica se loads falharam)
7. O `useEffect` de save detectou `uid && isLoaded === true` e `suppliers === []`
8. `saveUserData(uid, 'suppliers', [])` **sobrescreveu o documento no Firestore** com `[]`

**Prova no banco:**
```json
users/{uid}/data/suppliers → { "value": "[]", "updatedAt": 1779991466723 }
```
O `updatedAt: 1779991466723` é 2026-05-28 ~15h07 BRT — horário exato da sessão.

---

## 2. Por que só `suppliers` foi afetado

- `masterProducts` usa `saveChunkedData` que tem **proteção por fingerprint** — se o fingerprint da lista vazia `[]` difere do que foi carregado, o save é bloqueado. Mas como o load falhou e retornou `[]`, o fingerprint da lista vazia foi salvo. Na prática o que salvou o `masterProducts` foi que o load **não falhou** para ele — ou o fingerprint de 0 itens já correspondia ao que havia no Firestore antes.
- `supplierCatalogs` usa `loadAllCatalogs` (coleção separada, não `data/{key}`) — não foi afetado pelo padrão de save useEffect.
- `purchaseOrders` não foi afetado porque o load de purchaseOrders provavelmente não falhou (ou o Firestore estava estável para aquele doc específico).

**Vulnerabilidade raiz (pré-existente, não introduzida pela Sessão 5):**
```typescript
// firebaseService.ts — loadUserData captura qualquer erro e retorna fallback silenciosamente:
} catch (e: any) {
  console.error(`[Firebase] ❌ Erro ao carregar "${key}":`, e.code, e.message);
  return fallback; // ← retorna [] sem sinalizar erro para o caller
}

// App.tsx — setIsLoaded sempre dispara após loadAllData, sem verificar se loads falharam:
setDataLoading(false);
setIsLoaded(true); // ← incondicional

// App.tsx — save useEffect não distingue "usuário deletou todos os suppliers" de "load falhou":
useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'suppliers', suppliers); }, [...]);
```

---

## 3. Estado atual do banco de dados

| Dado | Localização Firestore | Estado |
|---|---|---|
| `suppliers` | `users/{uid}/data/suppliers` | ❌ `"[]"` — perdido |
| `masterProducts` | `users/{uid}/data/masterProducts_meta` + `_0`, `_1`... | ✅ Intacto |
| `supplierCatalogs` | `users/{uid}/catalogs/{supplierId}` | ✅ Intactos (coleção separada) |
| `purchaseOrders` | `users/{uid}/data/purchaseOrders` | ✅ Intactos |
| `globalPackRules` | `users/{uid}/data/globalPackRules` | ✅ Intacto |
| `productMappings` | `users/{uid}/data/mappings` | Verificar |

**O que foi perdido definitivamente:**
- A lista de `Supplier[]` com todos os campos: `quotes` (histórico de cotações/batches), `packRules` por fornecedor, `blacklist`, `whatsapp`, `address`, campos de logística/entrega
- Os `QuoteBatch[]` de cada fornecedor (histórico de todas as cotações) — estes NÃO estão nos catálogos
- Não há backup automático (usuário acabou de habilitar o Firestore Backup no mesmo dia)

**O que está intacto e permite reconstrução parcial:**
- `supplierCatalogs`: contém `supplierId`, `supplierName`, histórico de preços por produto, packQuantity, links com masterProducts
- `masterProducts`: catálogo de produtos próprios completo
- `purchaseOrders`: todos os pedidos com `supplierId` e `supplierName` — confirma quais fornecedores existiam

---

## 4. Recuperação: reconstruir suppliers a partir dos catálogos

**O que pode ser recuperado:** id, name, isEnabled. O resto (quotes, packRules, blacklist, campos de logística) não pode ser recuperado — precisa ser reconfigurado manualmente.

**Abordagem recomendada:** adicionar função de recuperação dentro do `SupplierManager`.

### 4a. Função de recuperação (App.tsx ou SupplierManager)

```typescript
// Função para reconstruir suppliers mínimos a partir dos catalogs já carregados em memória:
const reconstructSuppliersFromCatalogs = useCallback(() => {
  const catalogList = Object.values(supplierCatalogs); // Record<string, SupplierCatalog>
  if (catalogList.length === 0) return;
  
  const reconstructed: Supplier[] = catalogList.map(catalog => ({
    id: catalog.supplierId,
    name: catalog.supplierName,
    isEnabled: true,
    quotes: [],
    blacklist: [],
    packRules: [],
  }));
  
  setSuppliers(reconstructed); // o useEffect de save vai persistir automaticamente
}, [supplierCatalogs]);
```

### 4b. Banner de recuperação no SupplierManager

Exibir quando `suppliers.length === 0 && Object.keys(supplierCatalogs).length > 0`:

```tsx
{suppliers.length === 0 && Object.keys(supplierCatalogs).length > 0 && (
  <div className="bg-amber-900/40 border border-amber-700 rounded-lg p-4 mb-4">
    <p className="text-amber-300 font-medium">
      {Object.keys(supplierCatalogs).length} fornecedor(es) encontrado(s) nos catálogos mas não na lista.
    </p>
    <p className="text-amber-400/80 text-sm mt-1">
      Dados de cotações e configurações foram perdidos. Apenas nome e ID serão recuperados.
    </p>
    <button
      onClick={reconstructSuppliersFromCatalogs}
      className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm"
    >
      Reconstruir fornecedores a partir dos catálogos
    </button>
  </div>
)}
```

**Após reconstrução:** os catálogos de fornecedores já estão linkados por `supplierId` — o app voltará a funcionar normalmente. O operador precisará reconfigurar manualmente: whatsapp, endereço, dias de entrega, template de pedido, packRules por fornecedor, blacklist.

---

## 5. Fix: prevenir recorrência

**Objetivo:** impedir que um load que falhou silenciosamente sobrescreva dados válidos no Firestore.

### 5a. `app/services/firebaseService.ts` — adicionar opção `throwOnError`

Mudança mínima e não-breaking (parâmetro opcional):

```typescript
// Antes:
export const loadUserData = async <T>(userId: string, key: string, fallback: T): Promise<T> => {

// Depois:
export const loadUserData = async <T>(
  userId: string, key: string, fallback: T,
  opts?: { throwOnError?: boolean }
): Promise<T> => {
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
    if (opts?.throwOnError) throw e; // ← única linha adicionada
    return fallback;
  }
};
```

Todos os callers existentes sem `opts` continuam funcionando exatamente como antes.

### 5b. `app/App.tsx` — rastrear falhas e bloquear saves críticos

**Adicionar ref** perto dos outros refs/estado:
```typescript
// Ref (não state) — evita re-render, persiste entre renders
const failedCriticalLoads = useRef<Set<string>>(new Set());
```

**Dentro de `loadAllData`**, substituir os loads críticos por try/catch individual.
Os críticos são: `suppliers`, `purchaseOrders`, `mappings` (os mais difíceis de recuperar):

```typescript
// ANTES (dentro do Promise.all):
loadUserData<Supplier[]>(uid, 'suppliers', []),

// DEPOIS (separado do Promise.all, antes dele):
let savedSuppliers: Supplier[] = [];
try {
  savedSuppliers = await loadUserData<Supplier[]>(uid, 'suppliers', [], { throwOnError: true });
} catch {
  failedCriticalLoads.current.add('suppliers');
  console.warn('[App] ⚠️ Falha ao carregar suppliers — save bloqueado para prevenir perda de dados');
}
```

Fazer o mesmo para `purchaseOrders` e `mappings` (os outros podem ficar no Promise.all com fallback silencioso).

**Atualizar o `setSuppliers`** após o Promise.all:
```typescript
// O savedSuppliers já foi carregado acima — não incluir mais no Promise.all
setSuppliers(savedSuppliers);
```

**Atualizar o useEffect de save** para `suppliers`:
```typescript
// ANTES:
useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'suppliers', suppliers); }, [suppliers, uid, isLoaded]);

// DEPOIS:
useEffect(() => {
  if (uid && isLoaded && !failedCriticalLoads.current.has('suppliers')) {
    saveUserData(uid, 'suppliers', suppliers);
  }
}, [suppliers, uid, isLoaded]);
```

Mesmo padrão para `purchaseOrders` e `mappings`.

**Importante:** quando o usuário sair e logar novamente, `failedCriticalLoads` é um `useRef` que reinicia vazio — se o Firestore está saudável no novo login, tudo volta ao normal.

---

## 6. Arquivos a modificar nesta sessão

| Arquivo | O que muda |
|---|---|
| `app/services/firebaseService.ts` | +`opts?: { throwOnError?: boolean }` em `loadUserData` (~5 linhas) |
| `app/App.tsx` | +`failedCriticalLoads` ref; 3 loads viram try/catch individual; 3 save useEffects ganham guard |
| `app/components/SupplierManager` (ou onde for) | +banner de recuperação condicional + função `reconstructSuppliersFromCatalogs` |

**Ordem recomendada:**
1. Implementar e validar o fix (5a + 5b) — testar simulando erro de rede
2. Implementar o banner de recuperação — clicar e confirmar que suppliers são reconstruídos
3. Reconfigurar manualmente os dados perdidos (whatsapp, endereço, pack rules, etc.)

---

## 7. Verificação

1. Simular falha de Firestore: bloquear rede nas DevTools → recarregar app → confirmar que `suppliers` no Firestore NÃO foi sobrescrito com `[]`
2. Após fix: logar normalmente → `failedCriticalLoads` vazio → saves funcionam normalmente
3. Com catalogs carregados e suppliers vazio: banner aparece → clicar → `suppliers` reconstruídos e salvos
4. Confirmar que `tsc --noEmit` → exit 0 após as mudanças

---

## 8. Contexto adicional (para a sessão de recovery)

**Interface `Supplier` completa** (em `app/types.ts`):
```typescript
interface Supplier {
  id: string;
  name: string;
  isEnabled: boolean;
  location?: string;
  quotes: QuoteBatch[];    // ← PERDIDO, reconstruir como []
  blacklist?: string[];    // ← PERDIDO
  packRules?: PackRule[];  // ← PERDIDO
  whatsapp?: string;
  address?: string;
  deliveryType?: 'pickup' | 'delivery' | 'both';
  orderFrequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
  // ... demais campos opcionais de logística
}
```

**Interface `SupplierCatalog`** (o que sobreviveu):
```typescript
interface SupplierCatalog {
  supplierId: string;     // → Supplier.id
  supplierName: string;   // → Supplier.name
  products: SupplierCatalogProduct[];
  priceValidityMode: PriceValidityMode;
  priceValidityDays?: number;
  updatedAt: number;
}
```

**`supplierCatalogs` em App.tsx** já é um `Record<supplierId, SupplierCatalog>` carregado em memória via `loadAllCatalogs(uid)`. A função de reconstrução pode usar diretamente `Object.values(supplierCatalogs)` sem nenhuma chamada adicional ao Firestore.

**`loadAllCatalogs`** está em `app/services/supplierCatalogService.ts` (ou similar — verificar SMAP).
