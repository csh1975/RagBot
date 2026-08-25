/**
 * pdf-parse-fork 타입 선언
 * - pdf-parse-fork는 기본 export로 PDF(dataBuffer, options) async function을 제공한다
 */
declare module 'pdf-parse-fork' {
  interface PDFParseResult {
    numpages: number
    numrender: number
    info?: {
      Title?: string
      Author?: string
      Subject?: string
      Creator?: string
      Producer?: string
      CreationDate?: string
      ModDate?: string
    }
    metadata?: unknown
    text: string
    version?: string
  }

  interface PDFParseOptions {
    pagerender?: (pageData: {
      getTextContent(opts?: {
        normalizeWhitespace?: boolean
        disableCombineTextItems?: boolean
      }): Promise<{ items: Array<{ str: string; transform: number[] }> }>
    }) => string | Promise<string>
    max?: number
    version?: string
  }

  function PDF(dataBuffer: ArrayBuffer | Uint8Array, options?: PDFParseOptions): Promise<PDFParseResult>

  export default PDF
}
