import { useState, useCallback } from 'react';
import { Supplier, ProductQuote, PackRule } from '../types';
import { isNFeXml, parseNFeFile } from '../services/compras/parseNFe';
import { parseQuoteContent } from '../services/geminiService';
import { parseQuoteLocal } from '../services/compras/parseQuoteLocal';
import {
    filterBlacklisted,
    applyRulesToQuotes,
    recalculateItem,
} from '../services/compras/packRulesService';

// Re-exports para backward compatibility — importadores existentes não precisam mudar
export { filterBlacklisted, applyRule, applyRulesToQuotes, recalculateItem } from '../services/compras/packRulesService';

export interface ProcessingLog {
  source: 'nfe' | 'ai' | 'local-pdf';
  totalParsed: number;
  blacklistFiltered: number;
  rulesApplied: number;
  dateDetected: boolean;
}

// --- FILE PROCESSOR HOOK ---

export const useFileProcessor = () => {
    const [isProcessing, setIsProcessing] = useState(false);

    const processFile = useCallback(async (
        file: File,
        supplier: Supplier | undefined,
        globalPackRules: PackRule[],
        options?: { forceGemini?: boolean }
    ): Promise<{ quotes: ProductQuote[], detectedDate?: number, errorMessage?: string, processingLog?: ProcessingLog }> => {
        setIsProcessing(true);
        try {
            let quotes: ProductQuote[] = [];
            let detectedDate: number | undefined = undefined;
            let source: ProcessingLog['source'] = 'ai';
            const supplierExceptions = supplier?.packRules || [];
            const blacklist = supplier?.blacklist || [];

            if (isNFeXml(file)) {
                source = 'nfe';
                const nfeResult = await parseNFeFile(file);
                if (nfeResult.errorMessage && nfeResult.items.length === 0) {
                    setIsProcessing(false);
                    return { quotes: [], errorMessage: nfeResult.errorMessage };
                }
                quotes = nfeResult.items;
                detectedDate = nfeResult.detectedDate;
            } else {
                const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                let usedLocalPath = false;

                if (isPdf && !options?.forceGemini) {
                    try {
                        const { extractTextFromPdf, evaluateConfidence } = await import('../services/compras/extractTextFromPdf');
                        const rawText = await extractTextFromPdf(file);
                        const { items: localItems, detectedDate: localDate } = parseQuoteLocal(
                            rawText,
                            globalPackRules,
                            supplierExceptions,
                            '3-pdftext'
                        );
                        const confidence = evaluateConfidence(rawText, file.size, localItems.length);

                        if (confidence.confident) {
                            quotes = localItems;
                            detectedDate = localDate;
                            source = 'local-pdf';
                            usedLocalPath = true;
                        }
                    } catch (localErr) {
                        console.warn('[PDF-local] extraction failed, falling back to Gemini:', localErr);
                    }
                }

                if (!usedLocalPath) {
                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    const allRules = [...supplierExceptions, ...globalPackRules];
                    const geminiResult = await parseQuoteContent(base64, file.type, true, allRules);
                    quotes = geminiResult.items;
                    if (geminiResult.detectedDate) detectedDate = geminiResult.detectedDate;
                }
            }

            // Pipeline pós-parse unificado
            const totalParsed = quotes.length;
            quotes = filterBlacklisted(quotes, blacklist);
            const blacklistFiltered = totalParsed - quotes.length;
            quotes = applyRulesToQuotes(quotes, supplierExceptions, globalPackRules);
            const rulesApplied = quotes.filter(q => q.isReprocessed).length;

            const initializedQuotes = quotes.map(q => recalculateItem({...q, priceStrategy: q.priceStrategy ?? 'pack'}, q.priceStrategy ?? 'pack'));

            const processingLog: ProcessingLog = {
              source,
              totalParsed,
              blacklistFiltered,
              rulesApplied,
              dateDetected: !!detectedDate,
            };

            setIsProcessing(false);
            return { quotes: initializedQuotes, detectedDate, processingLog };
        } catch (e: any) {
            console.error("File Processor Error:", e);
            setIsProcessing(false);
            return { quotes: [], errorMessage: e.message || 'Falha ao processar arquivo via IA/XML.' };
        }
    }, []);

    return { isProcessing, processFile };
};
