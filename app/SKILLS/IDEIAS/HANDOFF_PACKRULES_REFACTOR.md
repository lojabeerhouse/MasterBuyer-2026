# Handoff — Refatoração GlobalPackRules / Regras de Lote
**Data:** 2026-05-27  
**Status:** ✅ Todas as 4 fases concluídas

---

## Contexto

O sistema de **Regras de Lote (PackRules)** determina quantas unidades compõem um lote/caixa de cada produto. Existem dois níveis:

- **Regras Globais** (`globalPackRules`) — aplicam-se a todos os fornecedores (ex: "Longneck = 24 un")
- **Exceções de Fornecedor** (`supplier.packRules`) — sobrescrevem as globais para um fornecedor específico (ex: "Fulano vende Longneck em caixas de 12")

Antes desta refatoração, o código estava disperso, duplicado e com bugs silenciosos.

---

## O que foi encontrado (diagnóstico pré-refactor)

| # | Problema | Arquivo(s) |
|---|---|---|
| P1 | **UI duplicada** — GlobalPackRules configurável em SupplierManager E AppSettings | SupplierManager, AppSettings |
| P2 | **`defaultGlobalPackRules` em App.tsx** — constante de domínio no orquestrador | App.tsx |
| P3 | **Bug NF-e** — `applyRulesToQuotes` nunca chamado após parse de XML | useFileProcessor.ts |
| P4 | **Dupla aplicação de regras** — `parseQuoteLocal` + `applyRulesToQuotes` em sequência | SupplierManager.tsx (2 locais) |
| P5 | **`priceStrategy` forçado** — recalculateItem sobrescrevia `'unknown'` para `'pack'` nos caminhos de texto | SupplierManager.tsx (2 locais) |
| P6 | **Gemini sem contexto de regras** — IA não recebia as PackRules do usuário | geminiService.ts |
| P7 | **Dead code** — `learnPackRulesFromBatch` desativada mas presente | SupplierManager.tsx |

---

## Pipeline de processamento unificado (pós-refactor)

```
Upload de arquivo
  ├── XML NF-e
  │     parseNFeFile() → inferPackQuantity() [regex própria, NF é confiável]
  │     ↓
  │     filterBlacklisted()           ← NOVO (antes não rodava em NF-e)
  │     applyRulesToQuotes()          ← NOVO (antes não rodava em NF-e)
  │     recalculateItem(preserva strategy)
  │
  └── PDF / Imagem
        parseQuoteContent(…, allRules)  ← NOVO: regras injetadas no prompt Gemini
        ↓
        filterBlacklisted()
        applyRulesToQuotes()
        recalculateItem(preserva strategy)

Paste de texto / Raw content
        parseQuoteLocal(text, globalRules, supplierExceptions)
          └─ inferPackQtyFromRules() já aplica regras durante parse
        ↓
        filterBlacklisted()
        recalculateItem(preserva strategy)  ← corrigido: não força 'pack' mais

"Sugerir Lotes por IA" (QuoteDetailModal)
        batchSmartIdentify(items, allRules)  ← NOVO: regras injetadas no prompt
```

---

## Onde cada coisa vive agora

| Responsabilidade | Arquivo | Nota |
|---|---|---|
| Tipo `PackRule` | `types.ts` | Inalterado |
| `Supplier.packRules?` | `types.ts` | Inalterado |
| Defaults + funções puras | `services/compras/packRulesService.ts` | **NOVO** — fonte única |
| Estado + persistência Firestore | `App.tsx` | `globalPackRules` state, load/save |
| Pipeline de processamento | `hooks/useFileProcessor.ts` | Importa do service |
| Configuração GLOBAL (UI) | `components/AppSettings.tsx` | Única UI para regras globais |
| Exceções por fornecedor (UI) | `components/compras/SupplierManager.tsx` | Botão "Exceções de Lote" — permanece |
| Re-aplicar globalmente (UI + lógica) | `AppSettings.tsx` + `App.tsx:handleReapplyGlobalPackRules` | Antes estava só no SupplierManager |

---

## Arquivos modificados por fase

### Fase 1 — Centralização da lógica
| Arquivo | O que mudou |
|---|---|
| `services/compras/packRulesService.ts` | **CRIADO** com `DEFAULT_GLOBAL_PACK_RULES`, `filterBlacklisted`, `applyRule`, `applyRulesToQuotes`, `recalculateItem` |
| `hooks/useFileProcessor.ts` | Remove 4 funções puras → importa do service; mantém re-exports para backward compat |
| `App.tsx` | Remove `defaultGlobalPackRules` → importa `DEFAULT_GLOBAL_PACK_RULES` do service |
| `SKILLS/SYSTEM_MAP/SMAP_MASTERB.md` | Registra `packRulesService.ts` |

### Fase 2 — Correção da cadeia funcional
| Arquivo | O que mudou |
|---|---|
| `hooks/useFileProcessor.ts` | Caminho NF-e agora chama `filterBlacklisted` + `applyRulesToQuotes` |
| `components/compras/SupplierManager.tsx` | Remove `applyRulesToQuotes` duplicado (2 locais) após `parseQuoteLocal` |
| `components/compras/SupplierManager.tsx` | Corrige `recalculateItem({…, priceStrategy: 'pack'})` → `recalculateItem({…, priceStrategy: q.priceStrategy ?? 'pack'})` em 2 locais |

### Fase 3 — Melhoria dos prompts Gemini
| Arquivo | O que mudou |
|---|---|
| `services/geminiService.ts` | `parseQuoteContent(…, packRules?)` — regras injetadas na instrução #3 do prompt |
| `services/geminiService.ts` | `batchSmartIdentify(…, packRules?)` — regras injetadas como seção de prioridade |
| `hooks/useFileProcessor.ts` | Combina `[...supplierExceptions, ...globalPackRules]` → passa ao `parseQuoteContent` |
| `components/QuoteDetailModal.tsx` | Nova prop `globalPackRules?`; combina com `supplier.packRules` antes de `batchSmartIdentify` |
| `components/compras/SupplierManager.tsx` | Passa `globalPackRules={globalPackRules}` ao `<QuoteDetailModal>` |

### Fase 4 — Remoção da UI Global do SupplierManager
| Arquivo | O que mudou |
|---|---|
| `components/compras/SupplierManager.tsx` | Remove: prop `setGlobalPackRules`, state `showGlobalRules`, branches `null` em `addPackRule`/`removePackRule`, `applyRulesRetroactively(null)`, `learnPackRulesFromBatch`, botão "REGRAS DE LOTE (GLOBAL)", `renderRulesModal(true)` |
| `components/compras/SupplierManager.tsx` | `renderRulesModal` simplificado — só exceções de fornecedor, sem parâmetro `isGlobal` |
| `components/AppSettings.tsx` | Nova prop `onReapplyGlobalRules?` + botão "Re-aplicar Regras a Todos os Fornecedores" |
| `App.tsx` | Remove `setGlobalPackRules` do render do SupplierManager; adiciona `handleReapplyGlobalPackRules`; passa para AppSettings |

---

## Comportamento do usuário — antes × depois

| Ação | Antes | Depois |
|---|---|---|
| Configurar regras globais | SupplierManager (botão REGRAS GLOBAIS) **ou** Configurações | **Só** Configurações (⚙️) |
| Configurar exceção de fornecedor | SupplierManager → "Exceções de Lote" | SupplierManager → "Exceções de Lote" (inalterado) |
| Re-aplicar globalmente | Botão no modal do SupplierManager | Botão em Configurações → "Re-aplicar Regras a Todos" |
| Qualidade do parse Gemini | IA sem contexto de regras | IA recebe regras configuradas no prompt (≤ 20) |
| Itens `isReprocessed` após NF-e | Regras nunca aplicadas em NF-e | Regras aplicadas como pós-processamento |
| Itens `priceStrategy: 'unknown'` | Forçados para `'pack'` silenciosamente | Preservados — operador vê destaque para revisar |

---

## Regras que NÃO mudaram (CLAUDE.md compliance)

- `types.ts` — nenhum campo renomeado ou removido ✅
- `firebaseConfig.ts` — intocável ✅
- Chave Firestore `globalPackRules` — inalterada ✅
- Props existentes de componentes — apenas adicionadas, nunca removidas ✅
- `supplier.packRules` — campo opcional, inalterado ✅

---

## Próximas melhorias sugeridas (não implementadas)

1. **Edição de regras existentes** — hoje só é possível remover e recriar. Um campo de edição inline melhoraria o UX.
2. **Importar/exportar regras** — CSV ou JSON para facilitar backup e compartilhamento entre usuários.
3. **Regras com prioridade explícita** — hoje a ordem no array define a prioridade; um campo `priority` tornaria isso mais claro.
4. **Regras com escopo de categoria** — aplicar regra apenas para "Cervejas" ou "Refrigerantes", não para todos os produtos.
5. **Indicador visual no QuoteDetailModal** — mostrar quais itens tiveram `isReprocessed: true` para que o operador saiba o que foi corrigido por regra.
