import { useState } from 'react';
import { Supplier, ProductQuote, PackRule } from '../types';
import { isNFeXml, parseNFeFile } from '../services/parseNFe';
import { parseQuoteContent } from '../services/geminiService';

// --- PURE FUNCTIONS FOR REUSE ---

export const filterBlacklisted = (quotes: ProductQuote[], blacklist: string[] = []): ProductQuote[] => {
    if (!blacklist || blacklist.length === 0) return quotes;
    return quotes.filter(q => !blacklist.includes(q.name));
};

export const applyRule = (quote: ProductQuote, rule: PackRule): ProductQuote => {
    if (quote.packQuantity > 1) {
        return { ...quote, isReprocessed: true };
    }
    const newQty = rule.quantity;
    const unitPrice = quote.priceStrategy === 'unit' ? quote.price : quote.price / newQty;
    return {
        ...quote,
        packQuantity: newQty,
        unitPrice: unitPrice,
        isVerified: false,
        isReprocessed: true
    };
};

export const applyRulesToQuotes = (quotes: ProductQuote[], supplierExceptions: PackRule[] = [], globalRules: PackRule[] = []): ProductQuote[] => {
    return quotes.map(quote => {
        const lowerName = quote.name.toLowerCase();
        const exception = supplierExceptions?.find(r => lowerName.includes(r.term.toLowerCase()));
        if (exception) return applyRule(quote, exception);
        const globalRule = globalRules?.find(r => lowerName.includes(r.term.toLowerCase()));
        if (globalRule) return applyRule(quote, globalRule);
        return quote;
    });
};

export const recalculateItem = (item: ProductQuote, newStrategy?: 'pack' | 'unit', newPackQty?: number): ProductQuote => {
    const strategy = newStrategy || item.priceStrategy || 'pack';
    const qty = newPackQty !== undefined ? newPackQty : item.packQuantity;
    const unitPrice = strategy === 'unit' ? item.price : item.price / (qty || 1);
    return {
        ...item,
        priceStrategy: strategy,
        packQuantity: qty,
        unitPrice: unitPrice,
        isVerified: qty > 1 ? true : item.isVerified
    };
};

// --- FILE PROCESSOR HOOK ---

export const useFileProcessor = () => {
    const [isProcessing, setIsProcessing] = useState(false);

    const processFile = async (
        file: File,
        supplier: Supplier | undefined,
        globalPackRules: PackRule[]
    ): Promise<{ quotes: ProductQuote[], detectedDate?: number, errorMessage?: string }> => {
        setIsProcessing(true);
        try {
            let quotes: ProductQuote[] = [];
            let detectedDate: number | undefined = undefined;
            const supplierExceptions = supplier?.packRules || [];
            const blacklist = supplier?.blacklist || [];

            if (isNFeXml(file)) {
                const nfeResult = await parseNFeFile(file);
                if (nfeResult.errorMessage && nfeResult.items.length === 0) {
                    setIsProcessing(false);
                    return { quotes: [], errorMessage: nfeResult.errorMessage };
                }
                quotes = nfeResult.items;
                detectedDate = nfeResult.detectedDate;
            } else {
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                const geminiResult = await parseQuoteContent(base64, file.type, true);
                quotes = geminiResult.items;
                if (geminiResult.detectedDate) detectedDate = geminiResult.detectedDate;
                
                quotes = filterBlacklisted(quotes, blacklist);
                quotes = applyRulesToQuotes(quotes, supplierExceptions, globalPackRules);
            }

            const initializedQuotes = quotes.map(q => recalculateItem({...q, priceStrategy: q.priceStrategy ?? 'pack'}, q.priceStrategy ?? 'pack'));
            
            setIsProcessing(false);
            return { quotes: initializedQuotes, detectedDate };
        } catch (e: any) {
            console.error("File Processor Error:", e);
            setIsProcessing(false);
            return { quotes: [], errorMessage: e.message || 'Falha ao processar arquivo via IA/XML.' };
        }
    };

    return { isProcessing, processFile };
};
