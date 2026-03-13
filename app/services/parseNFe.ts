/**
 * parseNFe.ts
 * Parser dedicado para XML de NF-e (Nota Fiscal Eletrônica) brasileira.
 *
 * Extrai itens diretamente da estrutura XML sem usar IA.
 * Campos utilizados:
 *   <dhEmi>  → data de emissão  → detectedDate
 *   <det>    → cada item da nota
 *     <xProd>  → nome do produto
 *     <qCom>   → quantidade comercial
 *     <vUnCom> → valor unitário comercial
 *     <uCom>   → unidade (UN, CX, FD, etc.)
 *     <cProd>  → código do produto no fornecedor → supplierSku (via sku)
 *     <cEAN>   → EAN/GTIN se disponível
 *
 * Retorna { items: ProductQuote[], detectedDate?: number }
 * onde ProductQuote já vem com isVerified = true (dados exatos da NF).
 */

import { ProductQuote } from '../types';

// ─── Tipos de retorno ────────────────────────────────────────────────────────

export interface ParseNFeResult {
  items: ProductQuote[];
  detectedDate?: number;   // timestamp epoch ms da dhEmi
  supplierCnpj?: string;   // CNPJ do emitente (para associação futura)
  supplierName?: string;   // xNome do emitente
  invoiceNumber?: string;  // nNF — número da nota
  invoiceSeries?: string;  // série da NF
  totalValue?: number;     // vNF — valor total da nota
  errorMessage?: string;   // preenchido se o parse falhar
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extrai o conteúdo de uma tag XML pelo nome.
 * Funciona tanto com namespace (nfeProc:xNome) quanto sem (xNome).
 * Retorna null se a tag não existir.
 */
function getTag(xml: string, tag: string): string | null {
  // Aceita qualquer namespace prefix antes do nome da tag
  const re = new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}>`, 'i');
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

/**
 * Extrai TODOS os blocos de uma tag repetida (ex: múltiplos <det>).
 */
function getAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>[\\s\\S]*?<\\/(?:[\\w]+:)?${tag}>`, 'gi');
  return xml.match(re) ?? [];
}

/**
 * Converte string numérica brasileira para number.
 * Aceita tanto "1234.56" quanto "1234,56".
 */
function parseNum(value: string | null): number {
  if (!value) return 0;
  return parseFloat(value.replace(',', '.')) || 0;
}

/**
 * Parseia dhEmi para timestamp epoch ms.
 * Formato NF-e: "2025-03-10T08:30:00-03:00" (ISO 8601 com timezone)
 */
function parseDhEmi(dhEmi: string | null): number | undefined {
  if (!dhEmi) return undefined;
  const ts = Date.parse(dhEmi);
  return isNaN(ts) ? undefined : ts;
}

/**
 * Remove entidades XML simples do texto do produto.
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Normaliza unidade de medida do fornecedor para algo legível.
 */
function normalizeUnit(uCom: string | null): string {
  if (!uCom) return 'UN';
  const u = uCom.toUpperCase().trim();
  const map: Record<string, string> = {
    UN: 'UN', UNID: 'UN', UNIDADE: 'UN',
    CX: 'CX', CAIXA: 'CX', CXA: 'CX',
    FD: 'FD', FARDO: 'FD', FDO: 'FD',
    PC: 'PC', PCT: 'PC', PACOTE: 'PC',
    KG: 'KG', GR: 'GR', G: 'GR',
    LT: 'LT', LATA: 'LT',
    TP: 'TP', TAPA: 'TP',
    DZ: 'DZ', DUZIA: 'DZ',
    MT: 'MT', M: 'MT', ML: 'ML', L: 'L',
  };
  return map[u] ?? u;
}

/**
 * Deduz packQuantity a partir do nome do produto e da unidade.
 *
 * Exemplos:
 *   "CERVEJA BRAHMA LATA 350ML CX C/12" → 12
 *   "CERVEJA HEINEKEN LN 330ML FD 24UN" → 24
 *   "CERVEJA AMSTEL 473ML C/6"          →  6
 *
 * Se a unidade do fornecedor for CX/FD e não encontrar número no nome,
 * retorna 1 (conservador — o usuário pode corrigir no modal).
 */
function inferPackQuantity(name: string, uCom: string | null): number {
  const upper = name.toUpperCase();

  // Padrões explícitos no nome: C/12, CX12, X12, C12, FD24, PCT6, etc.
  const patterns = [
    /\bC\s*\/\s*(\d+)\b/,    // C/12, C/ 24
    /\bCX\s*\/?\s*(\d+)\b/,  // CX12, CX/12
    /\bFD\s*\/?\s*(\d+)\b/,  // FD24, FD/24
    /\bPCT?\s*\/?\s*(\d+)\b/,// PC6, PCT/6
    /\bX\s*(\d{1,3})\b/,     // X12, X24
    /\b(\d{1,3})\s*UN\b/,    // 12UN, 24 UN
    /\b(\d{1,3})\s*UNID\b/,  // 12UNID
    /\bPACK\s*(\d+)\b/,      // PACK6
    /\bFARDO\s*(\d+)\b/,     // FARDO24
    /\bCX\s+(\d+)\b/,        // CX 12
  ];

  for (const re of patterns) {
    const m = upper.match(re);
    if (m) {
      const qty = parseInt(m[1], 10);
      if (qty >= 2 && qty <= 500) return qty;
    }
  }

  return 1; // Conservador: 1 unidade por padrão
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Parseia um XML de NF-e (string) e retorna os itens como ProductQuote[].
 *
 * @param xmlString  Conteúdo completo do arquivo .xml
 * @returns          ParseNFeResult com items, detectedDate e metadados da nota
 */
export function parseNFe(xmlString: string): ParseNFeResult {
  try {
    // ── 1. Validação básica ────────────────────────────────────────────────
    if (!xmlString || !xmlString.includes('<nfeProc') && !xmlString.includes('<NFe')) {
      return {
        items: [],
        errorMessage: 'Arquivo não reconhecido como NF-e. Verifique se é um XML de nota fiscal eletrônica.'
      };
    }

    // ── 2. Data de emissão ─────────────────────────────────────────────────
    const dhEmi = getTag(xmlString, 'dhEmi') ?? getTag(xmlString, 'dEmi'); // dEmi = formato antigo
    const detectedDate = parseDhEmi(dhEmi);

    // ── 3. Dados do emitente ───────────────────────────────────────────────
    const emiBlock = getAllBlocks(xmlString, 'emit')[0] ?? '';
    const supplierName = emiBlock ? decodeXmlEntities(getTag(emiBlock, 'xNome') ?? '') : undefined;
    const supplierCnpj = emiBlock ? (getTag(emiBlock, 'CNPJ') ?? undefined) : undefined;

    // ── 4. Número e série da nota ──────────────────────────────────────────
    const ideBlock = getAllBlocks(xmlString, 'ide')[0] ?? '';
    const invoiceNumber = ideBlock ? (getTag(ideBlock, 'nNF') ?? undefined) : undefined;
    const invoiceSeries  = ideBlock ? (getTag(ideBlock, 'serie') ?? undefined) : undefined;

    // ── 5. Valor total da nota ─────────────────────────────────────────────
    const totalBlock = getAllBlocks(xmlString, 'ICMSTot')[0]
                    ?? getAllBlocks(xmlString, 'vNF')[0]
                    ?? '';
    const vNF = totalBlock
      ? parseNum(getTag(totalBlock, 'vNF'))
      : parseNum(getTag(xmlString, 'vNF'));

    // ── 6. Itens (<det>) ───────────────────────────────────────────────────
    const detBlocks = getAllBlocks(xmlString, 'det');

    if (detBlocks.length === 0) {
      return {
        items: [],
        detectedDate,
        supplierName,
        supplierCnpj,
        invoiceNumber,
        invoiceSeries,
        totalValue: vNF || undefined,
        errorMessage: 'Nenhum item encontrado na NF-e. O XML pode estar incompleto ou em formato não suportado.'
      };
    }

    const items: ProductQuote[] = [];

    for (const det of detBlocks) {
      // Bloco <prod> dentro de <det>
      const prodBlock = getAllBlocks(det, 'prod')[0] ?? det;

      const xProd  = getTag(prodBlock, 'xProd');
      const qCom   = getTag(prodBlock, 'qCom');
      const vUnCom = getTag(prodBlock, 'vUnCom');
      const uCom   = getTag(prodBlock, 'uCom');
      const cProd  = getTag(prodBlock, 'cProd');
      const cEAN   = getTag(prodBlock, 'cEAN') ?? getTag(prodBlock, 'cEANTrib');

      // Ignorar itens sem nome ou preço
      if (!xProd || !vUnCom) continue;

      const name      = decodeXmlEntities(xProd);
      const unitPrice = parseNum(vUnCom);
      const quantity  = parseNum(qCom); // quantidade entregue (não usada no ProductQuote diretamente)

      if (unitPrice <= 0) continue;

      // Deduz packQuantity pelo nome do produto
      const packQuantity = inferPackQuantity(name, uCom);

      // Se packQuantity > 1, o vUnCom da NF é o preço da UNIDADE AVULSA.
      // O preço que o SupplierManager exibe/usa é o preço do LOTE (pack).
      // price = unitPrice * packQuantity
      const price = packQuantity > 1
        ? parseFloat((unitPrice * packQuantity).toFixed(4))
        : unitPrice;

      const unit = normalizeUnit(uCom);

      // SKU: usa cProd do fornecedor; se vier EAN válido, inclui como prefixo descritivo
      const eanClean = cEAN && cEAN !== '0' && cEAN !== 'SEM GTIN' ? cEAN : null;
      const sku = cProd ?? eanClean ?? '';

      const item: ProductQuote = {
        sku,
        name,
        price,          // preço do lote (ou unitário se packQty = 1)
        unit,
        packQuantity,
        unitPrice,      // sempre o preço da unidade avulsa
        priceStrategy: packQuantity > 1 ? 'pack' : 'unit',
        isVerified: true,    // dados vindos de NF são exatos — marca como verificado
        isReprocessed: false,
      };

      items.push(item);
    }

    if (items.length === 0) {
      return {
        items: [],
        detectedDate,
        supplierName,
        supplierCnpj,
        invoiceNumber,
        invoiceSeries,
        totalValue: vNF || undefined,
        errorMessage: 'XML lido, mas nenhum item pôde ser extraído. Verifique se os campos xProd e vUnCom estão presentes.'
      };
    }

    return {
      items,
      detectedDate,
      supplierName,
      supplierCnpj,
      invoiceNumber,
      invoiceSeries,
      totalValue: vNF || undefined,
    };

  } catch (err) {
    return {
      items: [],
      errorMessage: `Erro inesperado ao parsear NF-e: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

// ─── Detecção de tipo de arquivo ──────────────────────────────────────────────

/**
 * Verifica se um File ou conteúdo string é um XML de NF-e.
 * Usado pelo SupplierManager para decidir qual parser invocar.
 */
export function isNFeXml(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.xml') ||
    file.type === 'text/xml' ||
    file.type === 'application/xml'
  );
}

/**
 * Lê um File XML e retorna o ParseNFeResult.
 * Wrapper assíncrono para uso direto no SupplierManager.
 *
 * Uso:
 *   const result = await parseNFeFile(file);
 *   if (result.errorMessage) { ... }
 *   else { // result.items, result.detectedDate }
 */
export async function parseNFeFile(file: File): Promise<ParseNFeResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(parseNFe(content));
    };
    reader.onerror = () => {
      resolve({ items: [], errorMessage: 'Não foi possível ler o arquivo XML.' });
    };
    reader.readAsText(file, 'UTF-8');
  });
}
