// Ambient declarations for pdfjs-dist v5 (types corrupted during install)
declare module 'pdfjs-dist' {
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export interface TextItem {
    str: string;
    dir: string;
    transform: number[];
    width: number;
    height: number;
    fontName: string;
    hasEOL: boolean;
  }

  export interface TextMarkedContent {
    type: string;
    id: string;
  }

  export interface TextContent {
    items: (TextItem | TextMarkedContent)[];
    styles: Record<string, unknown>;
  }

  export interface PDFPageProxy {
    getTextContent(): Promise<TextContent>;
    cleanup(): void;
  }

  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    destroy(): void;
  }

  export interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>;
  }

  export function getDocument(src: { data: Uint8Array | ArrayBuffer }): PDFDocumentLoadingTask;
}

// Vite ?url import — resolves to string at build time
declare module '*?url' {
  const src: string;
  export default src;
}
