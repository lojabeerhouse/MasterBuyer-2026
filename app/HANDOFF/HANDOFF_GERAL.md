# HANDOFF — Módulos Gerais (não-Vendas) — MasterBuyer 2026

> **Destinatário:** Agente novo, sessão fresh.
> **Data de geração:** 2026-05-31
> **Assunto:** Estado atual e débitos técnicos dos módulos de Compras, Catálogo, Estoque, Dashboard, Upload e infraestrutura geral.

---

## 1. Protocolo obrigatório antes de qualquer código (CLAUDE.md)

Antes de qualquer alteração:
1. **Entendi:** 1 frase do que o usuário quer.
2. **Vou mexer em:** arquivos + o que muda.
3. **Riscos:** regressões ou conflitos.
4. **Skills consultadas:** quais skills foram lidas.
5. **Aguardando aprovação.** — só executar após "ok", "pode" ou equivalente.

**Gatilhos de aviso:**
- Se modificar > 3 arquivos ou tocar `types.ts`/`App.tsx`: avisar para commit antes.
- Reestruturação de componente existente: perguntar se salvou.

**Regras imutáveis:**
- `types.ts`: nunca renomear/deletar campos. Novos campos sempre opcionais (`?`).
- Dados em produção em `users/{userId}/data/{key}`.
- Firestore (leitura/escrita/esquema): ler `app/SKILLS/FORCATO-STACK/CATO-DATA-INSTRUCTIONS/SKILL.md`.
- Firestore (criar/alterar coleção): ler `app/DATA_MODEL/DATA_MODEL.skill.md`.
- UI/layout: ler `app/SKILLS/FORCATO-ERP-Design/SKILL.md`.
- Ícones: só `lucide-react`. Estilo: só Tailwind. Sem CSS inline.
- Mover arquivos: usar `git mv`. Atualizar imports com `sed`.

---

## 2. Stack

React 18 + TypeScript + Vite + Tailwind + Firebase (Auth/Firestore) + Gemini API.

Tokens de cor principais:
| Uso | Classe |
|---|---|
| Fundo | `bg-slate-950` |
| Cards/Nav | `bg-slate-900` |
| Bordas | `border-slate-800` |
| Texto principal | `text-slate-200` |
| Texto secundário | `text-slate-400` |
| Accent geral | `amber-600` |
| Accent ofertas | `red-600` |

---

## 3. Arquitetura Firestore — resumo

### Padrão Delta (coleções com 1 doc por item)

```
users/{uid}/{collectionKey}/{itemId}
Formato: { value: JSON.stringify(item), updatedAt: Date.now() }
Escrita: writeBatch — upsert apenas itens alterados
Guard: hydrated.has(key) — bloqueado se load não concluiu nesta sessão
Nunca: reescrever o array inteiro
```

Coleções ativas:
- `suppliers` — fornecedores parceiros
- `purchaseOrders` — pedidos de compra (kanban)
- `catalogs` — catálogos de cotação por fornecedor (via `supplierCatalogService.ts`)
- `saleOrders` — pedidos de venda (adicionados em 2026-05-31, módulo vendas)
- `pdvSessions` — sessões PDV (adicionados em 2026-05-31)
- `stockMovements` — reservado (API ainda não implementada)

### Padrão Blob (chave única `users/{uid}/data/{key}`)

Blobs ativos: `salesData`, `salesConfig`, `forecast`, `cart`, `mappings`, `ignoredMappings`, `masterProducts` (chunked), `dbSheetUrl`, `salesUrl`, `considerStock`, `globalPackRules`, `hiddenProducts`, `appSettings`, `userProfile`, `quoteStages`, `inventoryCount`, `inventoryTimestamps`, `categoryTree`, `priceValidityConfig`.

Guards: `hydrated.has(key)` + `lastCount` em `firebaseService.ts`. Salvar vazio sem `allowEmpty: true` é bloqueado.

---

## 4. Módulo Compras — estado e débitos

### 4.1 SupplierManager (`app/components/compras/SupplierManager.tsx`)

~540 linhas. Orquestra sub-componentes extraídos:
- `QuoteCard.tsx` — card de cotação no histórico
- `SupplierEditModal.tsx` — edição de fornecedor (nome, logística, horários, template)
- `BlacklistModal.tsx` — lista negra de itens
- `PackRulesModal.tsx` — exceções de embalagem por fornecedor
- `RawContentModal.tsx` — visualização de conteúdo bruto
- `ConfirmActionDialog.tsx` — ban/delete com checkbox "não perguntar de novo"
- `UnsavedChangesDialog.tsx` — alerta ao fechar com alterações

**Débitos conhecidos:** Nenhum registrado. Última refatoração importante em 2026-05-28 (migração suppliers para delta).

### 4.2 PackRules — arquitetura em camadas

Consulte memory `project_packrules_layer_architecture.md`. Resumo:
- 5 layers de resolução de `packQuantity` por especificidade
- `knownPackQtys` como UX (não como fonte de verdade de conversão)
- Fonte única: `app/services/compras/packRulesService.ts`

### 4.3 ParseSource — rastreamento de origem

Tipo `ParseSource` aprovado — substitui o antigo `sourceConfidence` numérico. Arquivo `parseQuoteLocal.ts` aceita `sourceOverride?: ParseSource`. Guards fiscais implementados. Consulte memory `project_parsesource_architecture.md`.

### 4.4 Upload Center (`app/components/UploadCenter.tsx` + `UploadItem.tsx`)

Hook `useFileProcessor.ts`: decide rota de parse (XML → `parseNFe` / PDF → local first via `extractTextFromPdf.ts` → fallback Gemini / outros → Gemini). Aplica packRules. Aceita `options.forceGemini`.

### 4.5 OrderManager (`app/components/compras/OrderManager.tsx`)

Kanban de pedidos de compra. Lê `purchaseOrders` do estado global (delta, Firestore). `getNextSeqNumber()` retorna max+1. Botão "Criar pedido" via `handleCreateOrderFromUpload` em `App.tsx`.

### 4.6 QuoteComparator / BuyingAssistant / QuoteRequest

Componentes de cotação multi-fornecedor. Estado: funcionais. Sem débitos registrados.

---

## 5. Módulo Estoque (InventoryCount)

`app/components/inventory_count/InventoryCount.tsx` — contagem física. Persiste em blob `inventoryCount` (mapa produto→contagem pendente) e `inventoryTimestamps` (último timestamp por produto).

**ATENÇÃO:** O campo `MasterProduct.stock` é atualmente gerenciado manualmente/via import. A Etapa 4 do módulo Vendas (em outro handoff) transformará stock em projeção de `stockMovements`. Esse módulo será impactado — coordenar com o agente de Vendas.

**Ideia pendente:** Histórico de contagens de estoque por produto — aguardando migração para SQL, **não implementar com Firestore**. Consulte memory `project_inventory_history_idea.md`.

---

## 6. Dashboard (`app/components/Dashboard.tsx`)

Painel geral do ERP. Lê `userProfile`, `suppliers`, `purchaseOrders`, `masterProducts`, `notifications`. Última atualização: commit `8fd2c4e` (dashboard att 1 + packrules v2).

---

## 7. Categorias (`CategoryManager`)

`app/components/category_manager/CategoryManager.tsx` + `categoryService.ts`. Persiste em blob `categoryTree`. Funcional, sem débitos registrados.

---

## 8. Notificações e Logs

- `loggerService.ts` — log central com buffer em memória
- `NotificationCenter.tsx` — bell + dropdown
- `ExpandedLogs.tsx` — painel expandido com filtros
- Blob `error_logs` em Firestore

---

## 9. App.tsx — padrão de estado

**Regra de 3 passos para novo estado:**
1. `useState` com tipo explícito e valor inicial vazio/default
2. Load em `loadAllData` (dentro de `Promise.all` do batch adequado)
3. `useEffect` com save — delta para coleções, blob para o resto

**Refs de diff delta:** `prevSuppliersRef`, `prevPurchaseOrdersRef`, `prevSaleOrdersRef`, `prevPdvSessionsRef` — todos resetados no `handleLogout` antes dos `setState`.

**`handleLogout`:** chama `resetSessionGuards()` → reset refs → setIsLoaded(false) → reset todos os estados.

---

## 10. Infraestrutura

- `app/firebaseConfig.ts` — **intocável**
- `app/services/firebaseService.ts` — único ponto de acesso ao Firestore. Nunca duplicar lógica de hydration.
- `app/vite.config.ts` — configuração Vite (não relevante para features)
- `app/package.json` / `package-lock.json` — dependências (pdfjs-dist adicionado recentemente para extração local de PDF)

---

## 11. Mapa de arquivos (referência rápida)

Consulte `app/SKILLS/SYSTEM_MAP/SMAP_MASTERB.md` para o mapa completo. Atualizar sempre que criar, renomear ou deletar arquivo em `/components` ou `/services`.

---

## 12. Ideias registradas não implementadas

| Ideia | Status | Nota |
|---|---|---|
| Histórico de contagens de estoque por produto | Aguarda SQL | **Não implementar com Firestore** |
| Outros itens do banco de ideias | Ver `app/SKILLS/IDEIAS/IDEIA_PLANEJAMENTO.skill.md` | — |

---

*Handoff gerado em 2026-05-31 pós-Etapa 2 do módulo Vendas.*
