/**
 * PDF 문서 파서
 * pdf-parse-fork 라이브러리 사용 (pdf-parse 포크, 서버리스/Next.js 호환)
 * - pdf-parse-fork는 자체 pdf.js(v1.10.100)를 번들링하며 disableWorker=true로 동작해
 *   Node/서버리스 환경에서 워커 설정이 필요 없다
 * - `pagerender` 콜백으로 페이지별 텍스트를 캡처해 pageNumber 메타데이터 유지
 * 반환: { text, metadata: { pageCount, pages: [{ pageNumber, text }] } }
 */

export interface ParsedPage {
  pageNumber: number
  text: string
}

export interface ParseResult {
  text: string
  metadata: {
    pageCount: number
    pages: ParsedPage[]
    fileSize: number
    title?: string
    author?: string
    subject?: string
    creator?: string
    producer?: string
    creationDate?: Date
    modificationDate?: Date
  }
}

/** pdf.js 페이지 getTextContent 결과의 최소 형태 */
interface TextContentItem {
  str: string
  transform: number[]
}

interface PDFPageLike {
  getTextContent(opts?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }): Promise<{
    items: TextContentItem[]
  }>
}

/** 기본 페이지 렌더 콜백 (pdf-parse-fork 기본값과 동일한 로직 + 페이지 텍스트 캡처) */
function renderPage(pageData: PDFPageLike): Promise<string> {
  return pageData
    .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
    .then(textContent => {
      let lastY: number | null = null
      let text = ''
      for (const item of textContent.items) {
        if (lastY === item.transform[5] || lastY === null) {
          text += item.str
        } else {
          text += '\n' + item.str
        }
        lastY = item.transform[5]
      }
      return text
    })
}

/**
 * PDF 파일 파싱
 * @param fileBuffer - PDF 파일 버퍼
 * @returns 파싱된 텍스트와 페이지별 메타데이터
 */
export async function parsePDF(fileBuffer: Buffer): Promise<ParseResult> {
  try {
    // pdf-parse-fork는 PDF async function을 default export
    const { default: PDF } = await import('pdf-parse-fork')

    // pagerender 콜백에서 페이지별 텍스트를 순서대로 캡처
    const pageTexts: string[] = []
    const result = await PDF(new Uint8Array(fileBuffer), {
      pagerender: async (pageData: PDFPageLike) => {
        const pageText = await renderPage(pageData)
        pageTexts.push(pageText)
        return pageText
      },
    })

    const fullText = result.text
    const totalPages = result.numpages

    // 페이지별 텍스트 구성 (렌더 실패 페이지는 빈 문자열 처리)
    const pages: ParsedPage[] = []
    for (let i = 1; i <= totalPages; i++) {
      pages.push({
        pageNumber: i,
        text: pageTexts[i - 1]?.trim() || '',
      })
    }

    // 메타데이터 추출
    const info = result.info || {}

    return {
      text: fullText,
      metadata: {
        pageCount: totalPages,
        pages,
        fileSize: fileBuffer.length,
        title: info.Title,
        author: info.Author,
        subject: info.Subject,
        creator: info.Creator,
        producer: info.Producer,
        creationDate: info.CreationDate ? new Date(info.CreationDate) : undefined,
        modificationDate: info.ModDate ? new Date(info.ModDate) : undefined,
      },
    }
  } catch (error) {
    console.error('[PDF Parser] 파싱 실패:', error)
    throw new Error(`PDF 파싱 실패: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * PDF 메타데이터만 추출 (빠른 미리보기용)
 */
export async function extractPDFMetadata(fileBuffer: Buffer): Promise<ParseResult['metadata']> {
  try {
    const { default: PDF } = await import('pdf-parse-fork')
    const result = await PDF(new Uint8Array(fileBuffer))
    const info = result.info || {}

    return {
      pageCount: result.numpages,
      pages: [],
      fileSize: fileBuffer.length,
      title: info.Title,
      author: info.Author,
      subject: info.Subject,
      creator: info.Creator,
      producer: info.Producer,
      creationDate: info.CreationDate ? new Date(info.CreationDate) : undefined,
      modificationDate: info.ModDate ? new Date(info.ModDate) : undefined,
    }
  } catch (error) {
    console.error('[PDF Parser] 메타데이터 추출 실패:', error)
    throw new Error(`PDF 메타데이터 추출 실패: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
