
import { GoogleGenAI, Type } from "@google/genai";
import { ProductQuote } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY });

// Parse text or file content into structured product quotes
export const parseQuoteContent = async (
  content: string,
  mimeType: string = 'text/plain',
  isBase64: boolean = false,
  packRules: { term: string; quantity: number }[] = []
): Promise<{ items: ProductQuote[], detectedDate?: number }> => {
  const ai = getAI();

  // Injeta regras do cliente no prompt apenas quando existem (backward-compatible se vazio)
  const packRulesSection = packRules.length > 0
    ? `\n       CUSTOMER PACK RULES — also valid when no explicit keyword is present (case-insensitive substring match):\n${packRules.slice(0, 20).map(r => `         - Name contains "${r.term}" → packQuantity = ${r.quantity}`).join('\n')}`
    : '';

  const prompt = `
    TASK: Extract product data from the provided input (Price List / Invoice).

    CRITICAL INSTRUCTIONS FOR PACK QUANTITY (LOTE):
    1. 'packQuantity' is the number of units inside the box/case.
    2. DO NOT CONFUSE LIQUID/WEIGHT MEASUREMENTS WITH QUANTITY.
       - "Cerveja 350ml" -> packQuantity is 1 (unless "cx 12" is specified).
       - "Refr 2L" -> packQuantity is not the "2L" in this example.
       - "Arroz 5kg" -> packQuantity is not the "5kg" in this example.
    3. ONLY extract 'packQuantity' > 1 if explicit keywords exist: "Cx", "Caixa", "Fd", "Fardo", "Pack", "C/12", "C/24", "X12", "C18".${packRulesSection}
    4. If unsure or if it looks like a single unit, and no customer pack rule matches, default 'packQuantity' to 1.
    5. READ THE ENTIRE DOCUMENT. Do not stop after the first few pages.
    6. Extract 'documentDate': the emission/issue date of the document (NOT a delivery/forecast date). Format: YYYY-MM-DD. Leave empty string if not found.
    7. CRITICAL: 'quantityBought' is the total AMOUNT OF PACKAGES OR UNITS bought/ordered on the invoice. Example: If they bought 2 boxes, 'quantityBought' = 2. If it's just a price list with no quantities bought, default to 1.
    8. CRITICAL: 'priceMode' — classify the detected price:
       - "pack"    → price clearly refers to the full box/case (e.g. document says "caixa R$35,00").
       - "unit"    → price clearly refers to a single unit (e.g. document says "un R$2,90").
       - "unknown" → you cannot determine with certainty which one it is. USE THIS FREELY — it is ALWAYS better to return "unknown" than to guess wrong.
    9. 'price' — the price EXACTLY as it appears in the document. Do NOT divide or multiply. Preserve the raw value.
    10. 'unitPrice' — calculate ONLY if priceMode is "pack" (= price / packQuantity). If priceMode is "unit" or "unknown", set unitPrice equal to price.
    11. 'rawLine' — the exact original line or cell from the document where this item was found (for traceability).

    OUTPUT SCHEMA (Object):
    - documentDate: string (ISO date YYYY-MM-DD of document emission, or "" if not found)
    - items: array of product objects:
      - sku: string (Code/ID)
      - name: string (Product Description)
      - price: number (Raw price as found in document — no math applied)
      - unit: string (Unit type: un, cx, kg)
      - packQuantity: number (Items per pack. Default 1)
      - unitPrice: number (price if priceMode is unit/unknown; price/packQuantity if priceMode is pack)
      - quantityBought: number (How many packs/units were purchased. Default 1 if missing)
      - priceMode: string ("pack", "unit", or "unknown")
      - rawLine: string (Original line/cell from document)

    Return RAW JSON only.
  `;

  let parts: any[] = [];

  // SANITIZE MIME TYPE: Gemini rejects 'application/vnd.ms-excel' (Windows CSVs)
  let safeMimeType = mimeType;
  if (safeMimeType === 'application/vnd.ms-excel' || safeMimeType === 'application/csv') {
    safeMimeType = 'text/csv';
  }

  if (isBase64) {
    parts = [
      {
        inlineData: {
          mimeType: safeMimeType,
          data: content
        }
      },
      { text: prompt }
    ];
  } else {
    parts = [{ text: `${prompt}\n\nDATA:\n${content}` }];
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentDate: { type: Type.STRING, description: "ISO date YYYY-MM-DD of document emission, or empty string" },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sku: { type: Type.STRING, description: "Code" },
                  name: { type: Type.STRING, description: "Name" },
                  price: { type: Type.NUMBER, description: "Raw price as found in document" },
                  unit: { type: Type.STRING, description: "Unit" },
                  packQuantity: { type: Type.NUMBER, description: "Qty" },
                  unitPrice: { type: Type.NUMBER, description: "Unit Price" },
                  quantityBought: { type: Type.NUMBER, description: "Qty Bought" },
                  priceMode: { type: Type.STRING, description: "pack | unit | unknown" },
                  rawLine: { type: Type.STRING, description: "Original line from document" }
                },
                required: ["name", "price", "packQuantity", "unitPrice", "priceMode"]
              }
            }
          },
          required: ["items"]
        }
      }
    });

    let text = response.text;
    if (!text) throw new Error("No data returned from AI");

    // Clean Markdown if present
    text = text.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```$/, "");

    const parseItems = (rawItems: any[]): ProductQuote[] =>
      rawItems.map(item => {
        const priceMode = item.priceMode === 'pack' || item.priceMode === 'unit'
          ? item.priceMode
          : 'unknown';
        return {
          sku: item.sku || 'S/N',
          name: item.name,
          price: item.price,
          unit: item.unit || 'un',
          packQuantity: item.packQuantity ?? 1,
          unitPrice: item.unitPrice ?? item.price,
          quantityBought: item.quantityBought ?? 1,
          priceStrategy: priceMode as 'pack' | 'unit' | 'unknown',
          rawLine: item.rawLine ?? undefined,
          isVerified: priceMode !== 'unknown' && (item.packQuantity ?? 1) > 1,
          parseSource: '5-ocr' as const,
        };
      });

    const parseDateStr = (dateStr?: string): number | undefined => {
      if (!dateStr) return undefined;
      const ts = new Date(dateStr + 'T00:01:00').getTime();
      return isNaN(ts) ? undefined : ts;
    };

    try {
      const parsed = JSON.parse(text);
      const rawItems = (parsed.items ?? parsed) as ProductQuote[];
      return {
        items: parseItems(rawItems),
        detectedDate: parseDateStr(parsed.documentDate),
      };
    } catch (parseError) {
      console.warn("JSON Parse failed, attempting auto-repair for truncated JSON...");
      const lastClose = text.lastIndexOf('}');
      if (lastClose !== -1) {
        const repaired = text.substring(0, lastClose + 1) + "}";
        try {
          const parsed = JSON.parse(repaired);
          const rawItems = (parsed.items ?? []) as ProductQuote[];
          return {
            items: parseItems(rawItems),
            detectedDate: parseDateStr(parsed.documentDate),
          };
        } catch (e2) {
          console.error("Repair failed:", e2);
          throw parseError;
        }
      }
      throw parseError;
    }

  } catch (error) {
    console.error("Gemini Parse Error:", error);
    throw error;
  }
};

export interface RawCatalogItem {
  rawName: string;
  baseName: string; // Name without flavor
  flavor: string; // The specific flavor or variation
  packFactor: number; // 12 if "12x", 6 if "cx 6", else 1
  val1: number; // First price found on line
  val2: number; // Second price found on line
}

export const extractCatalogRawData = async (
  base64: string,
  mimeType: string
): Promise<RawCatalogItem[]> => {
  const ai = getAI();

  const prompt = `
        TASK: Analyze this catalog image/PDF and extract raw product lines for CSV processing.
        
        For each product line, identify:
        1. rawName: The full product description.
        2. baseName: The product name WITHOUT the specific flavor (e.g. "LICOR JAPIRA CARAMELO" -> "LICOR JAPIRA").
        3. flavor: The flavor/variation part (e.g. "CARAMELO"). If none, leave empty.
        4. packFactor: Look for pack indicators like "12X", "CX/6", "FARDO 10". Extract the number. Default to 1 if not found.
        5. val1: The FIRST monetary value found on the line.
        6. val2: The SECOND monetary value found on the line. If only one price exists, repeat val1.

        OUTPUT: JSON Array of objects.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              rawName: { type: Type.STRING },
              baseName: { type: Type.STRING },
              flavor: { type: Type.STRING },
              packFactor: { type: Type.INTEGER },
              val1: { type: Type.NUMBER },
              val2: { type: Type.NUMBER }
            }
          }
        }
      }
    });

    let text = response.text;
    if (!text) return [];

    // Clean Markdown if present
    text = text.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```$/, "");

    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.warn("JSON Parse failed in extractCatalogRawData, attempting auto-repair...", parseError);
      // Attempt to repair truncated JSON
      const lastClose = text.lastIndexOf('}');
      if (lastClose !== -1) {
        const repaired = text.substring(0, lastClose + 1) + "]";
        try {
          return JSON.parse(repaired);
        } catch (e2) {
          console.error("Repair failed:", e2);
          throw parseError;
        }
      }
      throw parseError;
    }
  } catch (e) {
    console.error("Raw Extraction Error:", e);
    return [];
  }
};

export const batchSmartIdentify = async (
  items: { index: number, name: string, price: number }[],
  packRules: { term: string; quantity: number }[] = []
): Promise<{ index: number, suggestedPackQty: number }[]> => {
  const ai = getAI();

  // Safety limit to avoid huge payload
  const chunk = items.slice(0, 50);

  const packRulesSection = packRules.length > 0
    ? `\n        CUSTOMER PACK RULES (prioritize over general knowledge — case-insensitive substring match):\n${packRules.slice(0, 20).map(r => `           - Name contains "${r.term}" → packQuantity = ${r.quantity}`).join('\n')}\n`
    : '';

  const prompt = `
        You are a product identification expert for Brazilian supermarkets/wholesalers.

        I will provide a list of items (names and prices).
        Your ONLY job is to infer the 'packQuantity' (Lote/Embalagem) for each item.
           - If the name implies a pack (e.g. "cx", "fardo"), extract it.
           - DO NOT confuse 'ml' or 'kg' with quantity. '350ml' is NOT quantity 350.
           - If implied by context (e.g. a beer can usually comes in packs of 12 or 15 or 18), guess it.
           - If completely unknown, suggest 1.${packRulesSection}
        INPUT JSON:
        ${JSON.stringify(chunk)}

        OUTPUT format: JSON Array of objects: { "index": number, "suggestedPackQty": number }
    `;

  const schema = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          suggestedPackQty: { type: Type.INTEGER }
        }
      }
    }
  };

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({ model, contents: prompt, config: schema });
      return JSON.parse(response.text || "[]");
    } catch (e: any) {
      const is503 = e?.status === 503 || String(e?.message).includes('503') || String(e?.message).includes('high demand');
      if (is503 && model !== models[models.length - 1]) {
        console.warn(`batchSmartIdentify: ${model} indisponível, tentando próximo modelo...`);
        continue;
      }
      console.error("Batch ID Error:", e);
      return [];
    }
  }
  return [];
};

export const generatePurchaseStrategy = async (
  totalSavings: number,
  bestSupplierName: string,
  comparisonData: any
): Promise<string> => {
  const ai = getAI();
  const prompt = `
    Atue como o "Melhor Comprador do Brasil".
    Dados:
    - Economia: R$ ${totalSavings.toFixed(2)}
    - Fornecedor Principal: ${bestSupplierName}
    
    Resumo JSON: ${JSON.stringify(comparisonData).substring(0, 500)}...

    Gere um feedback curto (max 2 frases) motivando o comprador sobre a eficiência dessa cotação.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Análise indisponível.";
  } catch (e) {
    return "Estratégia indisponível.";
  }
};

export const interpretBulkEditCommand = async (command: string): Promise<{ field: string | null, value: any, error?: string }> => {
  const ai = getAI();

  const prompt = `
        You are a system that interprets natural language commands to update database fields in Portuguese.
        
        The user will provide a command like "Change price to 10.50" or "Set brand to Nike".
        
        You must map the command to one of the following ALLOWED FIELDS:
        - sku
        - name
        - priceSell
        - priceCost
        - stock
        - brand
        - category
        - tags
        - productGroup
        - ncm
        - unit
        - minStock
        - maxStock
        - location
        - status
        - origin
        - supplier
        - netWeight
        - grossWeight
        
        CRITICAL RULES:
        1. If user says "Fornecedor", map to 'supplier'.
        2. If user says "Origem" (Nacional/Importado), map to 'origin'.
        3. If user says "Peso", "Peso Bruto", map to 'grossWeight'.
        4. If user says "Peso Líquido", map to 'netWeight'.
        5. For numeric values with commas (e.g. 0,050), keep the comma in the string response so we can parse it correctly.
        
        SPECIAL RULE FOR NCM:
        - If the user asks to "Find NCM", "Search NCM", "Correct NCM", "Fill NCM", or "Pesquisar NCM" (implying looking up the correct code based on the product description), you must return:
          field: "ncm"
          value: "AUTO_GENERATE"
        - If the user specifies a number (e.g. "Change NCM to 2202"), return that number as the value.
        
        INSTRUCTIONS:
        1. Identify the target field from the command.
        2. Identify the target value. 
        3. If the command is unclear or the field is not in the list, return field: null.
        
        USER COMMAND: "${command}"
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            field: { type: Type.STRING, description: "The internal field name (e.g., priceSell) or null if invalid." },
            value: { type: Type.STRING, description: "The value to set. Return 'AUTO_GENERATE' if user wants AI lookup." }
          }
        }
      }
    });

    const result = JSON.parse(response.text || "{}");

    // Post-processing to cast types
    if (result.field) {
      const numericFields = ['priceSell', 'priceCost', 'stock', 'minStock', 'maxStock', 'netWeight', 'grossWeight', 'width', 'height', 'depth'];
      if (numericFields.includes(result.field)) {
        let valStr = String(result.value).trim();

        // PT-BR small decimal handling (e.g. 0,050 -> 0.050)
        if (valStr.includes(',')) {
          // Check if it's a thousands separator (1.000,00) or just a decimal (0,050)
          if (valStr.includes('.') && valStr.indexOf('.') < valStr.indexOf(',')) {
            // 1.000,00 format
            valStr = valStr.replace(/\./g, '').replace(',', '.');
          } else {
            // 0,050 format or 10,50 format
            valStr = valStr.replace(',', '.');
          }
        }

        const num = parseFloat(valStr);
        return { field: result.field, value: isNaN(num) ? 0 : num };
      }
      return { field: result.field, value: result.value };
    }

    return { field: null, value: null, error: "Não entendi qual campo alterar." };

  } catch (e) {
    console.error(e);
    return { field: null, value: null, error: "Erro ao interpretar comando." };
  }
}

export const batchSuggestNCM = async (
  items: { id: string, name: string }[]
): Promise<{ id: string, ncm: string }[]> => {
  const ai = getAI();

  // Process in chunks of 30 to avoid token limits
  const chunk = items.slice(0, 30);

  const prompt = `
        You are a Brazilian Tax Expert (Contabilidade/Fiscal).
        
        TASK: Identify the correct NCM (Nomenclatura Comum do Mercosul) code (8 digits, format XXXX.XX.XX) for each product below based on its description.
        
        If unsure, provide the most likely generalized code for that category (e.g. 2202.10.00 for soda).
        
        INPUT JSON:
        ${JSON.stringify(chunk)}
        
        OUTPUT: JSON Array of objects { "id": string, "ncm": string }.
        Ensure the 'id' matches the input.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              ncm: { type: Type.STRING }
            }
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Batch NCM Error:", e);
    return [];
  }
};

// Função de varinha mágica que busca variação de nomes.
// Atualmente aguardando um novo local na interface para ser aplicada, 
// pois foi removida do QuoteDetailModal para focar em lote.
export const generateProductVariations = async (productName: string): Promise<string[]> => {
  const ai = getAI();
  const prompt = `
    Você é um especialista em produtos de supermercado e bebidas no Brasil.
    
    O usuário fornecerá um nome de produto vago ou incompleto (Ex: "SPATEN").
    
    Sua tarefa é gerar uma lista de 3 a 5 variações comuns e específicas para esse produto que existem no mercado, 
    incluindo o NOME ORIGINAL + DETALHES (embalagem, volume, tipo).
    
    Exemplo Input: "SPATEN"
    Exemplo Output: ["Spaten Lata 350ml", "Spaten Long Neck 355ml", "Spaten Garrafa 600ml", "Spaten Lata 269ml"]

    Exemplo Input: "OMO"
    Exemplo Output: ["Sabão Pó Omo Lavagem Perfeita 800g", "Sabão Pó Omo Lavagem Perfeita 1.6kg", "Sabão Líquido Omo 3L"]

    INPUT: "${productName}"
    
    Retorne APENAS um Array JSON de strings. Nada mais.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Erro ao gerar variações:", e);
    return [];
  }
}

export const batchSuggestPackQuantity = async (
  names: string[]
): Promise<{ name: string, suggestedPackQty: number }[]> => {
  const ai = getAI();

  // Process in chunks of 50 to avoid token limits and rate limits
  const chunk = names.slice(0, 50);

  const prompt = `
    TASK: Atue como um assistente de busca na web focado em supermercados e atacados brasileiros.
    
    Para a lista de produtos fornecida abaixo, identifique a QUANTIDADE PADRÃO de itens que costumam vir em uma embalagem fechada (caixa, fardo, lote, etc).
    Imagine que você está pesquisando no Google: "[Nome do produto] quantidade caixa lote fardo".
    
    INSTRUÇÕES:
    1. Retorne APENAS um número para cada produto.
    2. Se não identificar indícios de ser um fardo/caixa e parecer ser um produto vendido unitariamente (Ex: uma televisão, um pacote único de salgadinho de 100g sem especificar fardo), retorne 1.
    3. Se houver variação, retorne a quantidade mais comum do mercado.
    
    INPUT LIST (JSON Array of strings):
    ${JSON.stringify(chunk)}
    
    OUTPUT: JSON Array de objetos no formato: { "name": string, "suggestedPackQty": number }.
    O "name" deve ser exatamente igual ao que foi enviado.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              suggestedPackQty: { type: Type.INTEGER }
            }
          }
        }
      }
    });

    let text = response.text || "[]";
    return JSON.parse(text);
  } catch (e) {
    console.error("Batch Pack Suggestion Error:", e);
    return [];
  }
};
