/**
 * PDF 문서 파서
 * pdf-parse 라이브러리 사용 (PDFParse 클래스 - pdfjs-dist 기반)
 * 반환: { text, metadata: { pageCount, pages: [{ pageNumber, text }] } }
 */

import { PDFParse, LoadParameters } from 'pdf-parse'

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

/**
 * PDF 파일 파싱
 * @param fileBuffer - PDF 파일 버퍼
 * @returns 파싱된 텍스트와 메타데이터
 */
export async function parsePDF(fileBuffer: Buffer): Promise<ParseResult> {
  try {
    const options: LoadParameters = {
      data: new Uint8Array(fileBuffer),
      verbosity: 0,
    }
    const parser = new PDFParse(options)
    
    // 전체 텍스트 추출
    const textResult = await parser.getText()
    const fullText = textResult.text
    
    // 페이지별 텍스트 추출
    const pages: ParsedPage[] = []
    const totalPages = textResult.total
    
    for (let i = 1; i <= totalPages; i++) {
      const pageText = textResult.getPageText(i)
      pages.push({
        pageNumber: i,
        text: pageText?.trim() || ''
      })
    }

    // 메타데이터 추출
    const infoResult = await parser.getInfo()
    const info = infoResult.info || {}

    await parser.destroy()

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
      }
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
  const options: LoadParameters = {
    data: new Uint8Array(fileBuffer),
    verbosity: 0,
  }
  const parser = new PDFParse(options)
  const infoResult = await parser.getInfo()
  const info = infoResult.info || {}
  await parser.destroy()
  
  return {
    pageCount: infoResult.total,
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
}