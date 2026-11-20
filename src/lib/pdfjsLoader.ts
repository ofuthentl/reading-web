import { isChunkLoadError, reloadOnceForStaleChunk } from '@/lib/chunkReload';

export const pdfWasmUrl = `${import.meta.env.BASE_URL}pdfjs-wasm/`;

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist')
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        return pdfjs;
      })
      .catch((err: unknown) => {
        pdfjsPromise = null;
        if (isChunkLoadError(err)) {
          reloadOnceForStaleChunk();
        }
        throw err;
      });
  }
  return pdfjsPromise;
}
