import { MasterProduct, InventoryCountMap } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPORT_HEADER =
  'ID Produto;Código Produto;GTIN;Descrição Produto;Depósito;Balanço;Valor;Preço de Custo;Observação;Data';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatExportDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** Remove delimitadores e quebras que quebrariam a estrutura CSV */
const clean = (s: string | number | undefined): string =>
  String(s ?? '').replace(/[;\n\r]/g, ' ').trim();

const formatPrice = (price: number | string | undefined): string =>
  clean(price).replace(',', '.');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Gera o conteúdo CSV de inventário no formato ERP.
 * @param products Lista completa de MasterProducts
 * @param counts   Mapa SKU → quantidade contada (apenas os contados)
 * @param depotName Nome do depósito/loja que aparecerá na coluna E
 */
export const generateInventoryCSV = (
  products: MasterProduct[],
  counts: InventoryCountMap,
  depotName: string,
): string => {
  const bom = '\uFEFF';
  const dateStr = formatExportDate(new Date());

  const createRow = (p: MasterProduct, qty: number): string => {
    const cost = formatPrice(p.priceCost);
    return [
      clean(p.id),
      clean(p.sku),
      clean(p.ean),
      clean(p.name),
      clean(depotName),
      qty.toString(),
      cost,  // Valor (coluna G)
      cost,  // Preço de Custo (coluna H)
      '',    // Observação
      dateStr,
    ].join(';');
  };

  // Exporta apenas os produtos que foram contados
  const rows = Object.entries(counts)
    .map(([id, qty]) => {
      const product = products.find(p => p.id === id);
      if (!product) return null;
      return createRow(product, qty);
    })
    .filter((row): row is string => row !== null);

  return `${bom}${EXPORT_HEADER}\n${rows.join('\n')}`;
};

/**
 * Dispara o download do arquivo CSV no browser.
 */
export const downloadInventoryCSV = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
