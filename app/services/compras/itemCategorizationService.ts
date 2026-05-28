import { ProductQuote, ProductMapping, MasterProduct } from '../../types';
import { normalizeProductName, normForMapping, findMasterProductMatches } from './supplierCatalogService';

export type ItemCategory = 'green' | 'blue' | 'yellow' | 'novelty' | 'inspection';

export function getItemCategory(
  item: ProductQuote,
  productMappings: ProductMapping[] | undefined,
  masterProducts: MasterProduct[] | undefined,
  seenNames: Set<string>,
): ItemCategory {
  if (item.isNovelty) return 'novelty';

  // Primary match: supplier SKU
  if (item.sku && item.sku !== 'S/N' && productMappings) {
    const skuMapping = productMappings.find(m => m.supplierSku === item.sku);
    if (skuMapping) {
      // Sanity check: if name similarity is too low, flag for human inspection
      const nameSim = findMasterProductMatches(item.name,
        masterProducts?.filter(p => p.sku === skuMapping.targetSku) ?? [], 1);
      const nameScore = nameSim.length > 0 ? nameSim[0].score : 0;
      if (nameScore < 40) return 'inspection';
      if (!skuMapping.targetType || skuMapping.targetType === 'master') {
        if (masterProducts?.some(p => p.sku === skuMapping.targetSku)) return 'green';
      }
      if (skuMapping.targetType === 'supplier') return 'blue';
    }
  }

  // Fallback: name-based mapping
  const mappingKey = normForMapping(item.name);
  const mapping = productMappings?.find(m => m.supplierProductNameNormalized === mappingKey);
  if (mapping) {
    if (!mapping.targetType || mapping.targetType === 'master') {
      if (masterProducts?.some(p => p.sku === mapping.targetSku)) return 'green';
    }
    if (mapping.targetType === 'supplier') return 'blue';
  }

  const displayKey = normalizeProductName(item.name);
  if (seenNames.has(displayKey)) return 'blue';
  return 'yellow';
}
