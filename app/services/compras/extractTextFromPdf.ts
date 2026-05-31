import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerReady = false;

export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');

  if (!workerReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    workerReady = true;
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Group text items by Y coordinate (PDF Y grows upward), sort by X within each row
    const lineMap = new Map<number, { x: number; str: string }[]>();

    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[] };
      if (!item.str?.trim() || !item.transform) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x, str: item.str });
    }

    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const row = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const line = row.map(e => e.str).join(' ').trim();
      if (line) lines.push(line);
    }
  }

  return lines.join('\n');
}

export interface ConfidenceResult {
  confident: boolean;
  reason: string;
}

export function evaluateConfidence(
  rawText: string,
  fileSize: number,
  itemCount: number
): ConfidenceResult {
  if (itemCount === 0) return { confident: false, reason: 'parse_vazio' };
  if (rawText.length < 200 && fileSize > 50_000) return { confident: false, reason: 'texto_insuficiente' };
  return { confident: true, reason: 'ok' };
}
