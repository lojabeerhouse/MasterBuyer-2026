# Handoff — Refatoração Estrutural SupplierManager + QuoteDetailModal
**Data:** 2026-05-28  
**Status:** ✅ Sessão 1 (Fases 1-3, 5, 6) + ✅ Sessão 2 (Bugs + Fase 4a) + ✅ Sessão 3 (Validação Arquitetônica) + ✅ Sessão 4 (Fase 4b — ItemRow) + ✅ Sessão 5 (parseSource + guards + especificidade)

---

## O que foi feito — Sessão 1 (original)

### Contexto
O SupplierManager.tsx tinha 1.737 linhas, 31 useState, 7 modais inline, 48 callbacks — e aproximadamente metade era código morto. O objetivo foi quebrar o mega-componente em unidades coesas sem alterar comportamento visível.

### Arquivos criados na Sessão 1

| Arquivo | Linhas | Responsabilidade |
|---|---|---|
| `app/hooks/useUploadQueue.ts` | 125 | Fila de upload, drag-drop, queue processor assíncrono |
| `app/components/compras/QuoteCard.tsx` | 137 | Card do histórico com badge isReprocessed |
| `app/components/compras/SupplierEditModal.tsx` | 319 | Modal de edição de fornecedor |
| `app/components/compras/BlacklistModal.tsx` | 72 | Modal da lista negra |
| `app/components/compras/PackRulesModal.tsx` | 95 | Modal de exceções de embalagem |
| `app/components/compras/RawContentModal.tsx` | 51 | Modal de conteúdo bruto |

**SupplierManager:** 1.737 → 627 linhas

---

## O que foi feito — Sessão 2 (bugs + Fase 4a)

### Bugs corrigidos antes das extrações

**Bug 1 — `useFileProcessor.ts`: `blacklistFiltered` sempre 0**
- Era hardcoded. Toast exibia contagem errada de itens filtrados.
- Fix: pipeline pós-parse unificado fora dos branches `if/else`. `totalParsed` capturado antes de `filterBlacklisted`; `blacklistFiltered = totalParsed - quotes.length` após. Bônus: eliminou duplicação entre branch NFe e branch AI.

**Bug 2 — `useUploadQueue.ts`: stale closure silenciado**
- `processFile` era chamado no `useEffect` mas não estava no deps array, silenciado com `eslint-disable-next-line react-hooks/exhaustive-deps`.
- Fix: `processFile` agora é `useCallback(async () => {...}, [])` em `useFileProcessor` (fecha apenas sobre `setIsProcessing`, que é estável). Com `processFile` estável, adicionado ao deps array e eslint-disable removido.

**Bug 3 — `QuoteCard.tsx`: React.memo comparator customizado quebrado**
- Comparava apenas `quote` e `supplierId`, ignorando 7 props de callback.
- Fix: removido o comparador customizado. React.memo padrão (shallow comparison de todas as props) funciona corretamente porque o pai usa `useCallback` em todos os callbacks.

**Bug 4 — `PackRulesModal.tsx`: `parseInt` sem radix**
- Fix: `parseInt(e.target.value, 10) || 1`

---

### Fase 4a — Extrações do QuoteDetailModal

**QuoteDetailModal:** 1.052 → **967 linhas** · TypeScript: exit code 0

#### Arquivos criados na Sessão 2

| Arquivo | Linhas | Responsabilidade |
|---|---|---|
| `app/components/compras/ConfirmActionDialog.tsx` | ~60 | Dialog de ban/delete com checkbox "não perguntar" |
| `app/components/compras/UnsavedChangesDialog.tsx` | ~55 | Dialog de alterações não salvas |
| `app/components/compras/QuoteSection.tsx` | ~130 | Seção de categoria com color map estático |
| `app/services/compras/itemCategorizationService.ts` | ~45 | `getItemCategory()` como função pura |

#### Decisões importantes tomadas

**`getItemCategory` → função pura (não hook)**
- `getItemCategory(item, productMappings, masterProducts, seenNames): ItemCategory`
- Chamada no QuoteDetailModal com 4 params explícitos. Sem closure sobre estado do componente.
- Tipo `ItemCategory` exportado: `'green' | 'blue' | 'yellow' | 'novelty' | 'inspection'`

**QuoteSection usa color map estático**
- `COLOR_CLASSES` com as 5 variantes: `orange`, `yellow`, `blue`, `emerald`, `violet`
- Tailwind classes completas no objeto (sem interpolação de string) — garante que o purge não remova as classes
- `renderItemRow` é passado como `renderRow` (render prop) — estado permanece no pai

**ConfirmActionDialog: `dontAskAgain` permanece no pai**
- O estado `dontAskAgain` e o `dontAskAgainRef` ficam no QuoteDetailModal
- `dontAskAgainRef.current = true` é atribuído em `confirmPendingAction` (que permanece no pai)
- O dialog recebe `dontAskAgain` como prop e chama `onDontAskAgainChange` para alterar

---

## Investigação: bug de índice de sugestões — NÃO é bug real

O challenge de planejamento levantou risco de `revealedSuggestions` e `computedSuggestionIdxs` serem keyed por posição no array filtrado (instável com sort). Após análise:

- `renderItemRow(item, idx, batchId)` recebe `idx = x.originalIndex` (posição no array completo do batch)
- Ambos o Map de sugestões e o Set de computed são keyed por `originalIndex`
- `originalIndex` é estável independente de sort/filter
- **Nenhuma mudança necessária**

---

## O que falta: Fase 4b — renderItemRow

**Localização:** `app/components/QuoteDetailModal.tsx`, linhas 461–691 (~230 linhas)

### Por que é complexo

`renderItemRow` depende de ~15 peças de estado do componente pai:

| Estado/Callback | Tipo |
|---|---|
| `animatingRows` | `Record<string, 'ban'\|'delete'>` |
| `draftQty`, `draftPrice` | `Record<number, number>` cada |
| `editingItemId`, `tempItemName` | estado de edição de nome |
| `revealedSuggestions` | `Map<number, {...}>` |
| `dismissedSuggestions` | `Set<string>` |
| `selectedPendingItems` | `Set<number>` |
| `handleRequestAction`, `toggleSelection`, `startEditingItem`, `saveItemName` | callbacks |
| `toggleItemVerification`, `updateItemStrategy`, `updateItemPackQuantity`, `updateItemPrice` | callbacks |
| `computeSuggestionForItem`, `setLinkingItem` | callbacks |

### Três opções arquiteturais

**Opção A — Extrair como função em arquivo separado (recomendada para esta iteração)**
- Mover para `app/components/compras/_renderItemRow.tsx`
- Agrupar em 2 objetos: `state: ItemRowState` + `callbacks: ItemRowCallbacks`
- Zero mudança de comportamento. Reduz QuoteDetailModal em ~230 linhas.
- Não permite React.memo mas inline já não tem overhead de reconciliação.

**Opção B — QuoteDetailContext + ItemRow como componente (arquitetura limpa, risco médio)**
- Criar `app/contexts/QuoteDetailContext.tsx` com estado de UI (draft, editing, animation, suggestions, selection)
- `ItemRow` lê do contexto — permite React.memo eficaz
- Risco: context re-renderiza todos os consumers — necessita split por sub-contexto

**Opção C — Agrupar estado em objetos sem context**
- ItemRow recebe ~5 objetos agrupados + callbacks
- Objects mudam referência em todo setState → React.memo ineficaz

### Complexidades que devem ser preservadas

1. **Sistema de draft (draftQty/draftPrice):**
   - `onChange` → atualiza draft state E `viewingBatch` localmente
   - `onBlur` → apenas limpa o draft (viewingBatch já foi atualizado)
   - Sincroniza com global `suppliers` apenas no save do batch
   - Keyed por `originalIndex` — estável

2. **Sistema de animação (animatingRows):**
   - Key = `"${batchId}-${itemIndex}"` (por `originalIndex`)
   - 2s timer via `setTimeout` → `deleteItemFromBatch` + remoção do animatingRows
   - Timer está em `triggerRowAnimation` (permanece no QuoteDetailModal)

3. **Sugestões lazy (revealedSuggestions + computedSuggestionIdxs):**
   - Calculadas no hover, via `computeSuggestionForItem(idx, name)`
   - `computedSuggestionIdxs` (ref) evita recalcular
   - Ambos keyed por `originalIndex`
   - Reset no `useEffect` quando `viewingBatch.id` muda

4. **Sidebar integration:**
   - `setSidebarContent` chamado em `useEffect` com `selectedPendingItems`
   - Cleanup (`clearSidebar`, `setCollapsed(false)`) no unmount
   - Badge count = `selectedPendingItems.size`

---

## O que foi feito — Sessão 4 (Fase 4b — ItemRow)

### Extração do renderItemRow

**QuoteDetailModal:** ~874 → **772 linhas** · TypeScript: exit code 0

| Arquivo | Linhas | Responsabilidade |
|---|---|---|
| `app/components/compras/ItemRow.tsx` | 288 | Linha de item de cotação — props flat tipadas, sem closure sobre pai |

**Abordagem adotada:** componente funcional com props individuais planas (não agrupadas em objetos).
- Parent computa valores derivados antes de passar: `isSelected`, `rowAnimationType`, `isEditingName`, `suggestion`, `isDismissed`
- `key={idx}` fica no `<ItemRow>` dentro do `renderItemRow` wrapper
- Os `<tr>` dentro de `ItemRow` não têm `key` (correto — não estão em array no escopo do componente)
- `getItemCategory` chamado uma vez no `ItemRow` e reutilizado (eliminadas as 3 chamadas redundantes do original)
- SMAP atualizado com todos os componentes extraídos nas Sessões 2 e 4

---

## Arquitetura atual (pós-sessão 4) ✅ REFATORAÇÃO ESTRUTURAL COMPLETA

```
SupplierManager (627 linhas, orquestrador)
  ├─ useUploadQueue (hook) ← processFile estável via useCallback
  ├─ useFileProcessor (hook) ← blacklistFiltered real
  ├─ SupplierEditModal
  ├─ BlacklistModal
  ├─ PackRulesModal ← parseInt corrigido
  ├─ RawContentModal
  ├─ QuoteCard ← React.memo padrão corrigido
  └─ QuoteDetailModal (772 linhas)
       ├─ ConfirmActionDialog ← extraído (Sessão 2)
       ├─ UnsavedChangesDialog ← extraído (Sessão 2)
       ├─ QuoteSection ← extraído (Sessão 2); color map estático
       ├─ getItemCategory() via itemCategorizationService ← função pura (Sessão 2)
       ├─ LinkProductModal (externo)
       ├─ QuoteActionsPanel (externo, sidebar)
       └─ ItemRow (288 linhas) ← extraído (Sessão 4)

app/services/compras/itemCategorizationService.ts  ← NOVO (Sessão 2)
app/components/compras/ItemRow.tsx                 ← NOVO (Sessão 4)
```

---

## Verificação (cheklist completo)

### Happy path
1. `cd app && node_modules/.bin/tsc.cmd --noEmit` → exit code 0
2. Abrir cotação → 5 seções aparecem com cores corretas (laranja, amarelo, azul, verde, violeta)
3. Editar item → nome, preço, lote → sync correto para suppliers state
4. Ban item → animação 2s → item some → blacklist atualizada
5. Sugestão lazy → hover em item não mapeado → sugestão aparece
6. Salvar batch → `isSaved: true` → card no histórico atualiza

### Casos de regressão a validar
7. Sort mode change com draft ativo → draft persiste no item certo
8. Sugestão após sort → hover no item → sugestão correta
9. Upload de 3 arquivos juntos → toasts com `blacklistFiltered` real (não zero)
10. Ban com `dontAskAgain` = true → segundo ban não exibe dialog
11. Fechar QuoteDetailModal → sidebar limpa corretamente (sem leak)

## TypeScript
Zero erros. Único erro pré-existente: `components/QuoteRequest.tsx` (não tocado).

---

## O que foi decidido — Sessão 3 (Validação Arquitetônica 2026-05-28)

### Validação do estado atual
- QuoteDetailModal real: **874 linhas** (handoff dizia 967 — melhor que o esperado)
- Todos os 4 componentes extraídos e 3 bugs corrigidos confirmados no código
- renderItemRow ainda inline (462–691, ~229 linhas) — Fase 4b pendente

### Decisão: parseSource em vez de sourceConfidence

**Rejeitado:** `sourceConfidence: number` (0–100) — arbitrário, sem operações significativas.

**Aprovado:** `parseSource` com prefixo numérico de confiança indicativa + `isManuallyEdited` + `appliedRuleId`:

```typescript
type ParseSource = '1-xml' | '2-nfepdf' | '3-pdftext' | '4-text' | '5-ocr'

// Em ProductQuote (types.ts) — campos novos, todos opcionais inicialmente
parseSource: ParseSource    // IMUTÁVEL após parse — método que originou os dados
isManuallyEdited?: boolean  // setado em qualquer edição manual no QuoteDetailModal
appliedRuleId?: string      // ID da PackRule aplicada automaticamente
```

| Valor | Método | Serviço atual | Serviço futuro |
|---|---|---|---|
| `'1-xml'` | NF-e XML estruturado | `parseNFe.ts` | sem mudança |
| `'2-nfepdf'` | PDF de NF-e com texto embutido (fiscal) | `geminiService.ts` hoje | parser dedicado |
| `'3-pdftext'` | PDF genérico legível (não NF-e) | `geminiService.ts` hoje | `pdfTextService.ts` |
| `'4-text'` | Texto colado/CSV | `parseQuoteLocal.ts` | sem mudança |
| `'5-ocr'` | OCR por IA (PDF escaneado/imagem) | `geminiService.ts` | OCR dedicado |

**O prefixo numérico É a documentação de confiança.** Legível sem consultar docs.

### Guards em applyRule()

```typescript
const FISCAL_SOURCES: ParseSource[] = ['1-xml', '2-nfepdf']

function applyRule(quote: ProductQuote, rule: PackRule): ProductQuote {
  if (FISCAL_SOURCES.includes(quote.parseSource)) return quote  // fiscal = imutável
  if (quote.isManuallyEdited) return quote                      // usuário decidiu = respeitar
  return { ...quote, packQuantity: rule.packQuantity, appliedRuleId: rule.id }
}
```

### Decisão: PackRules em sistema de camadas (todas as 3 ideias unificadas)

```
Layer 0 — FISCAL ('1-xml', '2-nfepdf') → guard em applyRule(), nunca sobrescrito
Layer 1 — MANUAL (isManuallyEdited)    → guard em applyRule(), nunca sobrescrito
Layer 2 — Supplier exception rules      → JÁ EXISTE, ordenar por term.length desc
Layer 3 — Global rules por especificidade → ordenar por term.length desc (2 linhas)
Layer 4 — Gemini OCR com regras injetadas → atual
Layer 5 — Fallback packQty=1, priceStrategy='unknown' → seção inspeção
```

**knownPackQtys (Ideia 3):** campo opcional em MasterProduct — não é camada automática, é UX: quando item linkado tem `knownPackQtys`, campo de lote vira select. Seleção → `isManuallyEdited = true`.

**Especificidade (Ideia 2):** implementar em `applyRulesToQuotes()`:
```typescript
const sortedSupplier = [...supplierRules].sort((a, b) => b.term.length - a.term.length)
const sortedGlobal = [...globalRules].sort((a, b) => b.term.length - a.term.length)
```

**Exceção por fornecedor (Ideia 1):** JÁ EXISTE e é necessária. Sem ambiguidade: cada QuoteBatch sabe de qual supplier veio, supplier rules sempre aplicam antes das globais.

---

## O que foi feito — Sessão 5 (parseSource + guards + especificidade)

> Implementado antes da Sessão 4 ser documentada — confirmado por git status em 2026-05-28.

| Arquivo | O que foi feito |
|---|---|
| `app/types.ts` | `export type ParseSource = '1-xml' \| '2-nfepdf' \| '3-pdftext' \| '4-text' \| '5-ocr'` + campos `parseSource?`, `isManuallyEdited?`, `appliedRuleId?` em `ProductQuote` |
| `app/services/compras/parseNFe.ts` | `parseSource: '1-xml'` em cada `ProductQuote` criado |
| `app/services/compras/parseQuoteLocal.ts` | `parseSource: '4-text'` em cada `ProductQuote` criado |
| `app/services/geminiService.ts` | `parseSource: '5-ocr' as const` em cada `ProductQuote` criado |
| `app/services/compras/packRulesService.ts` | `FISCAL_SOURCES` guard em `applyRule()` + sort por `term.length` desc em `applyRulesToQuotes()` |
| `app/components/QuoteDetailModal.tsx` | `isManuallyEdited: true` nos 5 handlers: `saveItemName`, `updateItemStrategy`, `updateItemPackQuantityLocal`, `updateItemPriceLocal`, `toggleItemNovelty` |

---

## Próxima etapa — Sessão 6: knownPackQtys em MasterProduct (UX)

Escopo:
1. `knownPackQtys?: number[]` + `defaultPackQty?: number` em `MasterProduct` em `types.ts`
2. Campo de preenchimento no modal de master products
3. `ItemRow.tsx`: quando item linkado a master com `knownPackQtys`, input de lote vira `<select>` com opções + "outro"
4. Seleção → `isManuallyEdited: true` via callback `updateItemPackQuantityLocal`
