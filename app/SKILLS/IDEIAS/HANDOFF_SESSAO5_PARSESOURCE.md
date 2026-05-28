# Handoff — Sessão 5: parseSource + Guards + isManuallyEdited

**Status:** ✅ IMPLEMENTADO e verificado (`tsc --noEmit` exit 0)
**Data:** 2026-05-28

---

## O que foi feito

Sessão 5 implementou rastreabilidade de origem de parse e proteção de edições manuais em 6 arquivos. Nenhum arquivo novo criado.

---

## 1. `app/types.ts` — novos tipos e campos

Adicionado no topo do arquivo:

```typescript
export type ParseSource = '1-xml' | '2-nfepdf' | '3-pdftext' | '4-text' | '5-ocr';
```

Adicionado à interface `ProductQuote` (campos opcionais, imutáveis nas próximas sessões):

```typescript
parseSource?: ParseSource;     // immutable after parse — method that originated the data
isManuallyEdited?: boolean;    // set on any manual edit in QuoteDetailModal
appliedRuleId?: string;        // ID of the PackRule automatically applied
```

**Decisão:** `ParseSource` é string literal union, NÃO enum TypeScript. O prefixo numérico é documentação legível embutida. `sourceConfidence: number` foi rejeitado (arbitrário, não operável). Os valores `'2-nfepdf'` e `'3-pdftext'` existem no tipo mas nenhum parser os atribui ainda — correto, são para Sessão 6+.

---

## 2. `app/services/compras/packRulesService.ts` — guards + ordenação + appliedRuleId

**Import atualizado:**
```typescript
import { PackRule, ParseSource, ProductQuote } from '../../types';
```

**Constante adicionada:**
```typescript
const FISCAL_SOURCES: ParseSource[] = ['1-xml', '2-nfepdf'];
```

**`applyRule()` reescrito** com ordem exata de guards:
```typescript
export const applyRule = (quote: ProductQuote, rule: PackRule): ProductQuote => {
  // Guard 1: itens fiscais imutáveis (o && defensivo é essencial para dados legados sem parseSource)
  if (quote.parseSource && FISCAL_SOURCES.includes(quote.parseSource)) return quote;
  // Guard 2: edições manuais respeitadas
  if (quote.isManuallyEdited) return quote;
  // Guard 3: já tem lote explícito no texto/OCR — apenas marca reprocessado
  if (quote.packQuantity > 1) {
    return { ...quote, isReprocessed: true };
  }
  const newQty = rule.quantity; // ATENÇÃO: é rule.quantity, NÃO rule.packQuantity (typo no handoff original)

  if (quote.priceStrategy === 'unknown') {
    return { ...quote, packQuantity: newQty, isReprocessed: true, appliedRuleId: rule.id };
  }
  const unitPrice = quote.priceStrategy === 'unit'
    ? quote.price
    : quote.price / newQty;
  return {
    ...quote,
    packQuantity: newQty,
    unitPrice,
    isVerified: false,
    isReprocessed: true,
    appliedRuleId: rule.id,
  };
};
```

**`applyRulesToQuotes()` atualizado** com ordenação por especificidade:
```typescript
export const applyRulesToQuotes = (
  quotes: ProductQuote[],
  supplierExceptions: PackRule[] = [],
  globalRules: PackRule[] = []
): ProductQuote[] => {
  const sortedSupplier = [...supplierExceptions].sort((a, b) => b.term.length - a.term.length);
  const sortedGlobal = [...globalRules].sort((a, b) => b.term.length - a.term.length);
  return quotes.map(quote => {
    const lowerName = quote.name.toLowerCase();
    const exception = sortedSupplier.find(r => lowerName.includes(r.term.toLowerCase()));
    if (exception) return applyRule(quote, exception);
    const globalRule = sortedGlobal.find(r => lowerName.includes(r.term.toLowerCase()));
    if (globalRule) return applyRule(quote, globalRule);
    return quote;
  });
};
```

**Typo corrigido:** O handoff original mencionava `rule.packQuantity`. O tipo `PackRule` usa `rule.quantity`. Isso foi detectado e corrigido antes da implementação.

**Edge case aceito:** dois termos de mesmo comprimento que ambos batem no mesmo item → comportamento depende da ordem original do array. Aceitável para Sessão 5; não causa bug, apenas resultado não-determinístico em caso raro.

---

## 3. `app/services/compras/parseNFe.ts` — parseSource '1-xml'

No objeto de criação do `ProductQuote` (linha ~259):
```typescript
parseSource: '1-xml',
```

---

## 4. `app/services/geminiService.ts` — parseSource '5-ocr'

No `parseItems` mapping function return object:
```typescript
parseSource: '5-ocr' as const,
```

**Decisão:** O geminiService hoje não distingue NF-e PDF de OCR genérico — tudo passa pelo mesmo pipeline AI. Usar `'2-nfepdf'` agora seria mentira sobre a origem real. Quando houver parser NF-e PDF dedicado, migra para `'2-nfepdf'`. Não é erro implementar `'5-ocr'` aqui.

---

## 5. `app/services/compras/parseQuoteLocal.ts` — parseSource '4-text'

No `items.push({...})`:
```typescript
parseSource: '4-text',
```

---

## 6. `app/components/QuoteDetailModal.tsx` — isManuallyEdited em 5 callbacks

**Decisão crítica:** `isManuallyEdited: true` é setado nos callbacks do `QuoteDetailModal`, NÃO no `ItemRow`. `ItemRow` é leaf component — chama callbacks, não gerencia estado. O draft system (`setViewingBatch`) vive no QuoteDetailModal.

Os 5 callbacks atualizados:

```typescript
// saveItemName — adiciona isManuallyEdited: true
idx === itemIndex ? { ...item, name: newName, isAiSuggested: false, isManuallyEdited: true } : item

// updateItemStrategy
idx === itemIndex ? { ...recalculateItem(item, newStrategy), isManuallyEdited: true } : item

// updateItemPackQuantityLocal
idx === itemIndex ? { ...recalculateItem(item, undefined, safeQty), isManuallyEdited: true } : item

// updateItemPriceLocal
return { ...item, price: safePrice, unitPrice, isAiSuggested: false, isManuallyEdited: true };

// toggleItemNovelty (5º callback — era gap no handoff original, incluído aqui)
idx === itemIndex ? { ...item, isNovelty: value, isManuallyEdited: true } : item
```

**`toggleItemVerification` NÃO recebeu `isManuallyEdited: true`** — verificar/des-verificar é uma ação de operador que não interfere com packRules (isManuallyEdited protege contra reprocessamento automático de lote, não de verificação).

---

## Estado do código após Sessão 5

| Arquivo | Status |
|---|---|
| `app/types.ts` | ✅ ParseSource type + 3 campos em ProductQuote |
| `app/services/compras/packRulesService.ts` | ✅ guards + ordenação + appliedRuleId |
| `app/services/compras/parseNFe.ts` | ✅ parseSource '1-xml' |
| `app/services/geminiService.ts` | ✅ parseSource '5-ocr' |
| `app/services/compras/parseQuoteLocal.ts` | ✅ parseSource '4-text' |
| `app/components/QuoteDetailModal.tsx` | ✅ 5 callbacks com isManuallyEdited |
| `tsc --noEmit` | ✅ exit 0 |

---

## Sessão 6 — o que vem a seguir

**knownPackQtys** em `MasterProduct` — permite que o operador registre os lotes válidos de cada produto do catálogo próprio, e o ItemRow exibe um select quando o item está linkado a um produto com knownPackQtys.

Mudanças planejadas para Sessão 6:
1. `app/types.ts` — adicionar `knownPackQtys?: number[]` e `defaultPackQty?: number` em `MasterProduct`
2. Modal de MasterProduct — campo para editar knownPackQtys
3. `app/components/compras/ItemRow.tsx` — exibir select de lotes quando item linkado tem knownPackQtys
4. Seleção no select → `updateItemPackQuantityLocal` com `isManuallyEdited: true` (já existente)

---

## Checklist de verificação (para confirmar que Sessão 5 funciona)

1. `tsc --noEmit` → exit 0 ✅
2. DevTools: upload cotação XML de NF-e → item deve ter `parseSource: '1-xml'`
3. Reprocessar batch NF-e → packQuantity não alterado (guard FISCAL funcionando)
4. Editar lote manualmente → `isManuallyEdited: true` → reprocessar → lote não reverte
5. Upload cotação texto com regras "Longneck" (24) e "Beats Longneck" (12) → "Beats Longneck" usa regra mais longa → `appliedRuleId` da regra de 12
6. Dados legados (sem parseSource) → regras aplicam normalmente (guard `&&` defensivo)
