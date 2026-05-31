# HANDOFF — Módulo Vendas (Sales) — MasterBuyer 2026

> **Destinatário:** Agente novo, sessão fresh.
> **Data de geração:** 2026-05-31
> **Assunto:** Histórico, estado atual e próximas etapas do módulo de Vendas (PDV, Pedidos de Venda, Estoque, Analytics).

---

## 1. Contexto do projeto

**Stack:** React 18 + TypeScript + Vite + Tailwind + Firebase (Auth/Firestore) + Gemini API.  
**Regras absolutas (CLAUDE.md):**
- Antes de qualquer código: apresentar plano (Entendi / Vou mexer em / Riscos / Skills consultadas / Aguardando aprovação). Executar só após "ok", "pode" ou equivalente.
- `types.ts`: nunca renomear/deletar campos. Novos campos sempre opcionais (`?`).
- Estado novo em `App.tsx` exige 3 passos: `useState`, sync em `loadAllData`, `useEffect` com save.
- Firestore: ler `app/SKILLS/FORCATO-STACK/CATO-DATA-INSTRUCTIONS/SKILL.md` antes de qualquer leitura/escrita/esquema.
- Firestore schema: ler `app/DATA_MODEL/DATA_MODEL.skill.md` antes de alterar.
- UI nova: ler `app/SKILLS/FORCATO-ERP-Design/SKILL.md`.
- Ícones: só `lucide-react`. Estilo: só Tailwind. Sem CSS inline.
- Padrão delta (escrita por item, nunca o array inteiro): `writeBatch`, guarded por `hydrated.has(key)`.

---

## 2. O que foi feito (Etapas 1 e 2)

### Etapa 1 — Tipos e Modelo de Dados (concluída)

**`app/types.ts`** — Adicionadas 3 seções novas (entre `INVENTORY COUNT` e `LOG SYSTEM`):

```typescript
// ─── SALE ORDERS ──────────────────────────────────────────────────────────────
export interface SaleOrderItem {
  productId: string;   // MasterProduct.id
  sku: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export type SaleOrderStatus =
  | 'pending'
  | 'stock_committed'
  | 'invoiced'
  | 'cancelled';

export interface SaleOrder {
  id: string;
  seqNumber?: number;
  origin: 'pdv' | 'b2b' | 'manual';
  status: SaleOrderStatus;
  items: SaleOrderItem[];
  paymentMethod: 'cash' | 'card' | 'pix' | 'mixed';
  subtotal: number;
  discount: number;
  total: number;
  customerId?: string;
  pdvSessionId?: string;
  stockMovementIds: string[];
  financialEntryId?: string;
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601
  createdBy: string;     // uid
  cancelReason?: string;
  notes?: string;
}

// ─── STOCK MOVEMENTS ──────────────────────────────────────────────────────────
export interface StockMovement {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  qty: number;          // positive = entry, negative = exit
  type: 'sale_out' | 'purchase_in' | 'count_sync' | 'adjustment' | 'reversal';
  refType: 'sale_order' | 'purchase_order' | 'inventory_count' | 'manual';
  refId: string;
  performedBy: string;  // uid
  createdAt: string;    // ISO 8601 — imutável após criação
  note?: string;
}

// ─── PDV SESSION ──────────────────────────────────────────────────────────────
export type PdvSessionStatus = 'open' | 'closed';

export interface PdvSession {
  id: string;
  cashierName: string;
  openedAt: string;           // ISO 8601
  closedAt?: string;          // ISO 8601
  openingBalance: number;
  saleOrderIds: string[];
  status: PdvSessionStatus;
  createdBy: string;          // uid
}
```

**`app/DATA_MODEL/DATA_MODEL.md`** — 3 novas entidades no final:
- `saleOrders`: `/users/{uid}/saleOrders/{orderId}` — padrão delta. Cancelamento muda status, nunca deleta.
- `stockMovements`: `/users/{uid}/stockMovements/{movementId}` — padrão delta, **append-only imutável**. Saldo = soma de todos `qty`.
- `pdvSessions`: `/users/{uid}/pdvSessions/{sessionId}` — padrão delta. Só 1 sessão `open` por vez.

---

### Etapa 2 — PDV gera SaleOrder real no Firestore (concluída)

**`app/services/firebaseService.ts`** — Adicionadas APIs públicas:

```typescript
// saleOrders
export const loadAllSaleOrders = <T extends DeltaItem>(uid) =>
  loadDeltaCollection<T>(uid, 'saleOrders', 'saleOrders');
export const upsertSaleOrders = <T extends DeltaItem>(uid, items) =>
  upsertDeltaItems<T>(uid, 'saleOrders', 'saleOrders', items);
export const deleteSaleOrders = (uid, ids) =>
  deleteDeltaItems(uid, 'saleOrders', 'saleOrders', ids);

// pdvSessions
export const loadAllPdvSessions = <T extends DeltaItem>(uid) =>
  loadDeltaCollection<T>(uid, 'pdvSessions', 'pdvSessions');
export const upsertPdvSessions = <T extends DeltaItem>(uid, items) =>
  upsertDeltaItems<T>(uid, 'pdvSessions', 'pdvSessions', items);
```

**`app/App.tsx`** — Seguindo o padrão 3-passos:
- `const [saleOrders, setSaleOrders] = useState<SaleOrder[]>([])`
- `const [pdvSessions, setPdvSessions] = useState<PdvSession[]>([])`
- `const prevSaleOrdersRef = useRef<SaleOrder[]>([])`
- `const prevPdvSessionsRef = useRef<PdvSession[]>([])`
- Load em `loadAllData` (Promise.all do terceiro batch junto com purchaseOrders, etc.)
- 2 `useEffect` de delta-write (saleOrders e pdvSessions — mesma estratégia de suppliers)
- `handleLogout` reseta os 2 refs e chama `setSaleOrders([])` / `setPdvSessions([])`
- `getNextSaleSeqNumber()` — retorna max(seqNumber) + 1
- `handleFinalizeSale(items, paymentMethod) → SaleOrder` — cria SaleOrder com `status: 'pending'`, `stockMovementIds: []`, sem toque no estoque ainda
- `<SalesDashboard>` recebe `onFinalizeSale={handleFinalizeSale}` e `userId={uid ?? ''}`

**`app/components/vendas/SalesDashboard.tsx`**:
- Interface tipada (saiu de `any` para `MasterProduct[]`, `onFinalizeSale`, `userId`)
- Passa `onFinalizeSale` ao `<POS>`

**`app/components/vendas/POS.tsx`** (reescrito):
- `selectedPayment: PaymentMethod | null` — estado local
- Botões "Dinheiro" / "Cartão/PIX" selecionam o método com highlight visual (emerald/blue ring)
- "Finalizar Venda" ativo só com `cart.length > 0 && selectedPayment !== null`
- `handleFinalize` → converte CartItem[] para SaleOrderItem[] → chama `onFinalizeSale` → abre overlay
- Overlay de confirmação: mostra `#seqNumber`, total, forma de pagamento, botão "Nova Venda"
- "Nova Venda" limpa carrinho, reseta método e fecha overlay

---

## 3. Arquitetura do fluxo de dados (estado atual)

```
PDV (POS.tsx)
  │  usuário monta carrinho + seleciona pagamento
  ▼
handleFinalizeSale (App.tsx)
  │  cria SaleOrder { status: 'pending', stockMovementIds: [] }
  │  setSaleOrders(prev => [newOrder, ...prev])
  ▼
useEffect delta-write (App.tsx)
  │  diff prev vs next → upsertSaleOrders(uid, changed)
  ▼
Firestore: users/{uid}/saleOrders/{orderId}
```

**O estoque NÃO é tocado ainda.** `MasterProduct.stock` permanece inalterado até a Etapa 4.

---

## 4. Próximas etapas (não implementadas)

### Etapa 3 — Tela de Pedidos de Venda (`SalesOrders.tsx`)

`app/components/vendas/SalesOrders.tsx` existe mas está vazio (placeholder). Deve:
- Listar `saleOrders` passados via props ou contexto
- Filtros: status (pending/stock_committed/invoiced/cancelled), data, método de pagamento
- Ação "Comprometer Estoque" (pending → stock_committed): gera `StockMovement` para cada item com `qty` negativo, atualiza `MasterProduct.stock` (cache), seta `stockMovementIds` no SaleOrder
- Ação "Cancelar Pedido": muda status para `cancelled`, gera movimentos de `reversal` para os stock_committed

### Etapa 4 — Estoque como projeção de StockMovements

- `MasterProduct.stock` vira um campo de cache derivado
- Implementar `stockMovements` no firebaseService (somente append, nunca delete/edit)
- Função `computeStock(productId): number` — soma todos `qty` dos `stockMovements` daquele produto
- Futura: tela de histórico de movimentos por produto

### Etapa 5 — SalesAnalyzer lendo SaleOrders reais

- Módulo atual (`SalesAnalyzer.tsx`) importa CSV manualmente
- Migrar para leitura de `saleOrders` do Firestore
- Preservar o fluxo CSV como fallback de importação histórica

### Etapa 6 — FinancialEntry básico

- Campo `financialEntryId` no SaleOrder já reservado em `types.ts`
- Tipo `FinancialEntry` ainda não criado

### Etapa 7 — Reestruturação Visual e Operacional do SalesDashboard (NOVO)

**Problema:** A aba de Vendas carece de layout premium harmonizado e integração das novas features.

**Solução técnica:** Alinhar o painel com o design Slate-950, dando visualização consolidada ao PDV, Pedidos B2B e Relatórios Dinâmicos de Giro.

Inclui:
- Redesign do `SalesDashboard.tsx`: tabs premium com indicadores (ex: badge de pedidos pendentes no tab "Pedidos de Vendas")
- PDV com barra de status de sessão (opcional: `PdvSession`)
- Aba "Pedidos de Vendas" com lista real de `saleOrders` + filtros + ações inline
- Dashboard unificado de giro por produto (leitura de `saleOrders` reais, não CSV)
- Referência de design: `app/SKILLS/FORCATO-ERP-Design/SKILL.md` — ler antes de qualquer UI

---

## 5. Arquivos chave para o agente novo

| Arquivo | Papel |
|---|---|
| `app/types.ts` | Tipos SaleOrder, SaleOrderItem, StockMovement, PdvSession |
| `app/services/firebaseService.ts` | APIs delta — loadAllSaleOrders, upsertSaleOrders, loadAllPdvSessions, upsertPdvSessions |
| `app/App.tsx` | Estado saleOrders/pdvSessions, handleFinalizeSale, getNextSaleSeqNumber |
| `app/components/vendas/SalesDashboard.tsx` | Orquestrador de abas de Vendas |
| `app/components/vendas/POS.tsx` | PDV — já integrado com handleFinalizeSale |
| `app/components/vendas/SalesOrders.tsx` | Placeholder — próxima tela a implementar |
| `app/DATA_MODEL/DATA_MODEL.md` | Esquema Firestore de saleOrders, stockMovements, pdvSessions |
| `app/SKILLS/SYSTEM_MAP/SMAP_MASTERB.md` | Mapa de componentes e coleções Firestore |
| `app/SKILLS/FORCATO-ERP-Design/SKILL.md` | Design system — ler antes de qualquer UI |
| `app/SKILLS/FORCATO-STACK/CATO-DATA-INSTRUCTIONS/SKILL.md` | Regras de segurança Firestore — ler antes de qualquer persistência |
| `app/CLAUDE.md` | Protocolo de execução obrigatório |

---

## 6. Padrão delta — resumo para o agente

Todos os `saleOrders`, `pdvSessions` e futuros `stockMovements` seguem o padrão:

```
Firestore path: users/{uid}/{collectionKey}/{itemId}
Formato doc:    { value: JSON.stringify(item), updatedAt: Date.now() }
Escrita:        writeBatch — upsert apenas itens alterados (diff por JSON.stringify)
Guard:          hydrated.has(key) — bloqueado se load não concluiu nesta sessão
Deleção:        saleOrders NUNCA deletados — status 'cancelled'. stockMovements NUNCA deletados.
```

---

*Assinaturas de skills consultadas nesta sessão: 🛡️cdi. 📋DATA_MODEL.*
