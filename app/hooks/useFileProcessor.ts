import { useState } from 'react';
import { Supplier, ProductQuote, PackRule } from '../types';
import { isNFeXml, parseNFeFile } from '../services/compras/parseNFe';
import { parseQuoteContent } from '../services/geminiService';
import {
    filterBlacklisted,
    applyRulesToQuotes,
    recalculateItem,
} from '../services/compras/packRulesService';

// Re-exports para backward compatibility — importadores existentes não precisam mudar
export { filterBlacklisted, applyRule, applyRulesToQuotes, recalculateItem } from '../services/compras/packRulesService';

export interface ProcessingLog {
  source: 'nfe' | 'ai';
  totalParsed: number;
  blacklistFiltered: number;
  rulesApplied: number;
  dateDetected: boolean;
}

// --- FILE PROCESSOR HOOK ---

export const useFileProcessor = () => {
    const [isProcessing, setIsProcessing] = useState(false);

    const processFile = async (
        file: File,
        supplier: Supplier | undefined,
        globalPackRules: PackRule[]
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
                quotes = filterBlacklisted(quotes, blacklist);
                quotes = applyRulesToQuotes(quotes, supplierExceptions, globalPackRules);
            } else {
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
                quotes = filterBlacklisted(quotes, blacklist);
                quotes = applyRulesToQuotes(quotes, supplierExceptions, globalPackRules);
            }

            const totalParsed = quotes.length;
            const blacklistFiltered = 0; // tracked upstream (before filterBlacklisted)
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
    };

    return { isProcessing, processFile };
};
