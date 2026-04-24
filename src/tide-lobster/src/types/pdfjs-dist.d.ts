declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(args: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{
          items: Array<{ str?: string }>;
        }>;
      }>;
    }>;
  };
}
