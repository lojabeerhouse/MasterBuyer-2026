import { ProductQuote } from '../types';

/**
 * Parser local v3 — sem Gemini, 100% offline
 *
 * Suporta dois grandes grupos de formato:
 *
 * GRUPO 1 — WhatsApp / texto informal:
 *   "Skol Lata 350ml = 2,99"
 *   "HEINEKEN LN 330ml = 5,69"
 *   "Brahma c/18 53,82"
 *   "BEB CHOPP STEMPEL 12X355ML R$50,59 R$4,22"
 *   "Skol 2,89"
 *
 * GRUPO 2 — PDF/tabela estruturada (ex: Vicentin):
 *   "0000000003339 COLA GARRA 20G C/10 INSTANTANEA R$41,20 R$4,12"
 *   "0000000001528 COND ACAFRAO 10X30G ST RITA R$12,32 R$1,23"
 *   "0000000000110 COPO AMERICANO 190ML C/24 R$22,53 R$0,94"
 *
 * Regras de volumetria:
 *   ml, g, gr, kg, l, mt, cm, mm -> SEMPRE são medidas, nunca lote ou preço
 */

const VOLUME_UNITS = /\d+[,.]?\d*\s*(?:ml|g|gr|kg|l|lt|lts|mt|cm|mm)\b/gi;

const extractSku = (line: string): string => {
  const match = line.match(/^\d{8,}/);
  return match ? match[0] : 'S/N';
};

const extractPrices = (line: string): number[] => {
  const cleaned = line.replace(VOLUME_UNITS, ' ');

  let matches = cleaned.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];

  if (matches.length === 0) {
    matches = cleaned.match(/(?<![.\d])\d{1,4},\d{2}(?!\d)/g) || [];
  }

  return matches
    .map(m => parseFloat(m.replace(/R\$\s*/, '').replace(/\./g, '').replace(',', '.')))
    .filter(n => !isNaN(n) && n > 0);
};

const extractPackQty = (line: string): number | null => {
  const patterns: RegExp[] = [
    /\bpct\s*c\s*\/\s*(\d+)/i,
    /\bc\s*\/\s*(\d+)\s*(?:und?s?|pcs?)?\b/i,
    /\bcx\s*\/?\s*(\d+)/i,
    /\bfardo\s*(\d+)/i,
    /\bfdo\s*(\d+)/i,
    /\bpack\s*(\d+)/i,
    /\b(\d+)\s*x\s*\d+[,.]?\d*\s*(?:ml|g|gr|kg|l)\b/i,
    /\b(\d+)\s*x\b(?!\s*\d+[,.]?\d*\s*(?:ml|g|gr|kg|l))/i,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const qty = parseInt(match[1]);
      if (qty > 1 && qty <= 500) return qty;
    }
  }
  return null;
};

const extractName = (line: string): string => {
  let name = line;

  name = name.replace(/^\d{8,}\s*/, '');
  name = name.replace(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/gi, '');
  name = name.replace(/=\s*\d{1,4},\d{2}/g, '');
  name = name.replace(/\s+\d{1,4},\d{2}\s*$/g, '');
  name = name.replace(/\bpct\s*c\s*\/\s*\d+/gi, '');
  name = name.replace(/\bc\s*\/\s*\d+\s*(?:und?s?|pcs?)?\b/gi, '');
  name = name.replace(/\bcx\s*\/?\s*\d+/gi, '');
  name = name.replace(/\bfardo\s*\d+/gi, '');
  name = name.replace(/\bfdo\s*\d+/gi, '');
  name = name.replace(/\bpack\s*\d+/gi, '');
  name = name.replace(/\b\d+\s*x\s*(\d+[,.]?\d*\s*(?:ml|g|gr|kg|l)\b)/gi, '$1');
  name = name.replace(/\b\d+\s*x\b(?!\s*\d)/gi, '');
  name = name.replace(/\s{2,}/g, ' ').trim();
  name = name.replace(/[-=\/\\|.]+$/, '').trim();

  return name;
};

const inferPackQtyFromRules = (
  name: string,
  rules: { term: string; quantity: number }[]
): number => {
  const norm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const rule of rules) {
    const normTerm = rule.term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (norm.includes(normTerm)) return rule.quantity;
  }
  return 1;
};

const resolvePrices = (
  prices: number[],
  packQty: number
): { packPrice: number; unitPrice: number } => {
  if (prices.length === 0) return { packPrice: 0, unitPrice: 0 };

  if (prices.length === 1) {
    const p = prices[0];
    if (packQty > 1) return { packPrice: p, unitPrice: parseFloat((p / packQty).toFixed(4)) };
    return { packPrice: p, unitPrice: p };
  }

  const bigger = Math.max(prices[0], prices[1]);
  const smaller = Math.min(prices[0], prices[1]);

  if (packQty > 1) {
    const expectedUnit = parseFloat((bigger / packQty).toFixed(4));
    const tolerance = expectedUnit * 0.05 + 0.02;
    if (Math.abs(smaller - expectedUnit) <= tolerance) {
      return { packPrice: bigger, unitPrice: smaller };
    } else {
      return { packPrice: bigger, unitPrice: expectedUnit };
    }
  }

  if (bigger === smaller) return { packPrice: bigger, unitPrice: bigger };
  return { packPrice: bigger, unitPrice: smaller };
};

export const parseQuoteLocal = (
  text: string,
  globalPackRules: { term: string; quantity: number }[] = [],
  supplierPackRules: { term: string; quantity: number }[] = []
): ProductQuote[] => {
  const allRules = [...supplierPackRules, ...globalPackRules];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  const results: ProductQuote[] = [];

  for (const line of lines) {
    const prices = extractPrices(line);
    if (prices.length === 0) continue;

    const sku = extractSku(line);
    const name = extractName(line);
    if (!name || name.length < 2) continue;

    const explicitQty = extractPackQty(line);
    const rulesQty = inferPackQtyFromRules(name, allRules);
    const packQty = explicitQty ?? rulesQty;

    const { packPrice, unitPrice } = resolvePrices(prices, packQty);
    if (packPrice === 0 && unitPrice === 0) continue;

    results.push({
      sku,
      name: name.toUpperCase(),
      price: packPrice,
      unit: 'un',
      packQuantity: packQty,
      unitPrice,
      priceStrategy: 'pack',
      isVerified: explicitQty !== null,
      isReprocessed: explicitQty === null && rulesQty > 1,
    });
  }

  return results;
};
