import type { Supplier } from '../types';

export interface StockMarketEntry {
  productName: string;
  supplierName: string;
  supplierId: string;
  currentPrice: number;
  previousPrice: number;
  change: number;
  changePct: number;
  date: number;
}

export function calcPriceMovers(suppliers: Supplier[], searchTerm: string = ''): {
  topGainers: StockMarketEntry[];
  topLosers: StockMarketEntry[];
  lastUpdated: number | null;
} {
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const searchTerms = searchTerm.toLowerCase().trim().split(/\s+/).filter(Boolean);

  const priceMap = new Map<string, { price: number; date: number; supplierName: string; productName: string; supplierId: string }[]>();

  for (const supplier of suppliers) {
    const savedQuotes = (supplier.quotes || [])
      .filter(q => q.status === 'completed' && q.items.length > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const batch of savedQuotes) {
      for (const item of batch.items) {
        if (!item.isVerified || item.unitPrice <= 0) continue;
        const itemNameLower = item.name.toLowerCase();
        if (searchTerms.length > 0 && !searchTerms.every(t => itemNameLower.includes(t))) continue;
        const key = `${supplier.id}|${item.name.toLowerCase().trim()}`;
        if (!priceMap.has(key)) priceMap.set(key, []);
        priceMap.get(key)!.push({
          price: item.unitPrice,
          date: batch.timestamp,
          supplierName: supplier.name,
          productName: item.name,
          supplierId: supplier.id,
        });
      }
    }
  }

  const entries: StockMarketEntry[] = [];
  let lastUpdated: number | null = null;

  for (const [, records] of priceMap) {
    if (records.length < 2) continue;
    records.sort((a, b) => a.date - b.date);
    const latest = records[records.length - 1];
    const previous = records[records.length - 2];
    if (now - latest.date > ONE_WEEK) continue;
    const change = latest.price - previous.price;
    const changePct = previous.price > 0 ? (change / previous.price) * 100 : 0;
    if (Math.abs(changePct) < 0.1) continue;
    if (latest.date > (lastUpdated ?? 0)) lastUpdated = latest.date;
    entries.push({
      productName: latest.productName,
      supplierName: latest.supplierName,
      supplierId: latest.supplierId,
      currentPrice: latest.price,
      previousPrice: previous.price,
      change,
      changePct,
      date: latest.date,
    });
  }

  const sorted = entries.sort((a, b) => b.changePct - a.changePct);
  const topGainers = sorted.filter(e => e.changePct > 0).slice(0, 5);
  const topLosers = [...sorted].reverse().filter(e => e.changePct < 0).slice(0, 5);
  return { topGainers, topLosers, lastUpdated };
}
