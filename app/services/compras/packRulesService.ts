import { PackRule, ParseSource, ProductQuote } from '../../types';

// ─── Defaults ─────────────────────────────────────────────────────────────────
// Regras padrão aplicadas a novos usuários e como fallback.
// Termo (case-insensitive) → lote padrão quando nenhuma regra do usuário bate primeiro.

export const DEFAULT_GLOBAL_PACK_RULES: PackRule[] = [
  { id: 'def-1',  term: 'Lata 350ml',  quantity: 12 },
  { id: 'def-2',  term: 'Lata 473ml',  quantity: 12 },
  { id: 'def-3',  term: 'Longneck',    quantity: 24 },
  { id: 'def-4',  term: 'Long Neck',   quantity: 24 },
  { id: 'def-5',  term: '300ml',       quantity: 23 },
  { id: 'def-6',  term: '600ml',       quantity: 6  },
  { id: 'def-7',  term: '1L',          quantity: 6  },
  { id: 'def-8',  term: '1.5L',        quantity: 6  },
  { id: 'def-9',  term: '2L',          quantity: 6  },
  { id: 'def-10', term: 'Redbull',     quantity: 12 },
  { id: 'def-11', term: '250ml',       quantity: 12 },
  { id: 'def-12', term: '269ml',       quantity: 12 },
  { id: 'def-13', term: '473ml',       quantity: 12 },
  { id: 'def-14', term: '500ml',       quantity: 12 },
  { id: 'def-15', term: 'Askov',       quantity: 6  },
  { id: 'def-16', term: 'Ice',         quantity: 24 },
];

// ─── Funções puras de aplicação de regras ─────────────────────────────────────

const FISCAL_SOURCES: ParseSource[] = ['1-xml', '2-nfepdf'];

/** Filtra itens cujo nome exato está na blacklist do fornecedor. */
export const filterBlacklisted = (
  quotes: ProductQuote[],
  blacklist: string[] = []
): ProductQuote[] => {
  if (!blacklist || blacklist.length === 0) return quotes;
  return quotes.filter(q => !blacklist.includes(q.name));
};

/**
 * Aplica uma PackRule a um único item.
 * - Itens fiscais (1-xml, 2-nfepdf) são imutáveis — nunca sobrescritos.
 * - Itens editados manualmente (isManuallyEdited) são respeitados.
 * - Se o item já tem packQuantity > 1 por parse, apenas marca isReprocessed.
 * - Se priceStrategy é 'unknown', atualiza lote mas não divide o preço.
 * - Caso contrário, recalcula unitPrice com base no novo lote.
 */
export const applyRule = (quote: ProductQuote, rule: PackRule): ProductQuote => {
  if (quote.parseSource && FISCAL_SOURCES.includes(quote.parseSource)) return quote;
  if (quote.isManuallyEdited) return quote;
  if (quote.packQuantity > 1) {
    return { ...quote, isReprocessed: true };
  }
  const newQty = rule.quantity;

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

/**
 * Percorre uma lista de ProductQuotes e aplica:
 * 1. Exceções do fornecedor (prioridade maior, ordenadas por especificidade)
 * 2. Regras globais (fallback, ordenadas por especificidade)
 */
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

/**
 * Recalcula unitPrice de um item com base na estratégia de preço e quantidade do lote.
 * Usado após edições manuais de packQuantity ou priceStrategy pelo operador.
 */
export const recalculateItem = (
  item: ProductQuote,
  newStrategy?: 'pack' | 'unit' | 'unknown',
  newPackQty?: number
): ProductQuote => {
  const strategy = newStrategy || item.priceStrategy || 'pack';
  const qty = newPackQty !== undefined ? newPackQty : item.packQuantity;

  let unitPrice: number;
  if (strategy === 'unit') {
    unitPrice = item.price;
  } else if (strategy === 'pack') {
    unitPrice = item.price / (qty || 1);
  } else {
    // 'unknown': não divide — mantém price como valor provisório até o operador confirmar
    unitPrice = item.price;
  }

  return {
    ...item,
    priceStrategy: strategy,
    packQuantity: qty,
    unitPrice,
    isVerified: strategy === 'unknown' ? false : (qty > 1 ? true : item.isVerified),
  };
};
