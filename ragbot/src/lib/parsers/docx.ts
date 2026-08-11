/**
 * DOCX 문서 파서
 * mammoth 라이브러리 사용 (Word .docx 파일 텍스트 추출)
 * 반환: { text, metadata: { pageCount, pages: [{ pageNumber, text }] } }
 * 참고: DOCX는 페이지 개념이 명확하지 않아 전체를 1페이지로 처리
 */

import * as mammoth from 'mammoth'

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
    creationDate?: Date
    modificationDate?: Date
  }
}

/**
 * DOCX 파일 파싱
 * @param fileBuffer - DOCX 파일 버퍼
 * @returns 파싱된 텍스트와 메타데이터
 */
export async function parseDOCX(fileBuffer: Buffer): Promise<ParseResult> {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer })
    const text = result.value

    if (!text || text.trim().length === 0) {
      throw new Error('추출된 텍스트가 없습니다')
    }

    // 메시지가 있으면 경고 로그
    if (result.messages && result.messages.length > 0) {
      console.warn('[DOCX Parser] 변환 메시지:', result.messages)
    }

    // DOCX는 페이지 구분이 명확하지 않으므로 전체를 1페이지로 처리
    // 향후 필요시 mammoth의 convertToHtml로 스타일 정보 활용 가능
    const pages: ParsedPage[] = [{
      pageNumber: 1,
      text: text.trim()
    }]

    return {
      text: text.trim(),
      metadata: {
        pageCount: 1,
        pages,
        fileSize: fileBuffer.length,
        // DOCX 메타데이터는 별도 라이브러리(docx-meta 등) 필요
        title: undefined,
        author: undefined,
        subject: undefined,
        creator: undefined,
        creationDate: undefined,
        modificationDate: undefined,
      }
    }
  } catch (error) {
    console.error('[DOCX Parser] 파싱 실패:', error)
    throw new Error(`DOCX 파싱 실패: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * DOCX 파일인지 확인 (매직 넘버 또는 확장자)
 * DOCX는 ZIP 기반 포맷 (PK\x03\x04)
 */
export function isDOCXFile(filename: string, buffer?: Buffer): boolean {
  if (filename.toLowerCase().endsWith('.docx')) return true
  
  if (buffer && buffer.length >= 4) {
    // ZIP 매직 넘버: PK\x03\x04
    const signature = buffer.toString('hex', 0, 4).toUpperCase()
    if (signature.startsWith('504B0304')) {
      // 추가 확인: [Content_Types].xml 존재 여부로 DOCX 판별 가능
      // 여기서는 확장자와 매직 넘버로만 판단
      return true
    }
  }
  
  return false
}