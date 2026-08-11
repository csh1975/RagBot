/**
 * HWPX 문서 파서
 * HWPX는 ZIP 기반 포맷으로, 내부 XML에서 텍스트 추출
 * 주의: Node.js 환경에서만 동작 (브라우저 불가)
 */

import { createReadStream } from 'fs'
import { Extract } from 'unzipper'
import { DOMParser } from '@xmldom/xmldom'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'

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
 * HWPX 파일에서 텍스트 추출
 * HWPX 구조:
 * - Contents/section0.xml, section1.xml ... (본문)
 * - Contents/header.xml, footer.xml
 * - DocInfo/meta.xml (메타데이터)
 * - META-INF/container.xml
 * 
 * @param fileBuffer - HWPX 파일 버퍼
 * @returns 파싱된 텍스트와 메타데이터
 */
export async function parseHWPX(fileBuffer: Buffer): Promise<ParseResult> {
  // 임시 디렉토리에 압축 해제
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hwpx-'))
  
  try {
    // 버퍼를 임시 파일에 저장
    const tempFile = path.join(tempDir, 'document.hwpx')
    await fs.writeFile(tempFile, fileBuffer)

    // 압축 해제
    const extractedDir = path.join(tempDir, 'extracted')
    await fs.mkdir(extractedDir, { recursive: true })
    
    await new Promise<void>((resolve, reject) => {
      createReadStream(tempFile)
        .pipe(Extract({ path: extractedDir }))
        .on('close', resolve)
        .on('error', reject)
    })

    // 메타데이터 추출
    const metadata = await extractHWPXMetadata(extractedDir, fileBuffer.length)

    // 본문 텍스트 추출 (section*.xml)
    const pages = await extractHWPXText(extractedDir)
    
    const fullText = pages.map(p => p.text).join('\n\n')

    return {
      text: fullText,
      metadata: {
        ...metadata,
        pages,
        pageCount: pages.length
      }
    }
  } catch (error) {
    console.error('[HWPX Parser] 파싱 실패:', error)
    throw new Error(`HWPX 파싱 실패: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    // 임시 파일 정리
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // 정리 실패 무시
    }
  }
}

/**
 * HWPX 메타데이터 추출 (DocInfo/meta.xml)
 */
async function extractHWPXMetadata(
  extractedDir: string, 
  fileSize: number
): Promise<ParseResult['metadata']> {
  const metaPath = path.join(extractedDir, 'DocInfo', 'meta.xml')
  
  try {
    const metaContent = await fs.readFile(metaPath, 'utf-8')
    const parser = new DOMParser()
    const doc = parser.parseFromString(metaContent, 'text/xml')

    const getText = (tagName: string): string | undefined => {
      const elements = doc.getElementsByTagName(tagName)
      return elements.length > 0 ? elements[0].textContent?.trim() : undefined
    }

    return {
      pageCount: 0, // 본문 파싱 후 업데이트
      pages: [],
      fileSize,
      title: getText('dc:title') || getText('title'),
      author: getText('dc:creator') || getText('author'),
      subject: getText('dc:subject') || getText('subject'),
      creator: getText('meta:generator') || getText('generator'),
      creationDate: getText('dc:date') ? new Date(getText('dc:date')!) : undefined,
      modificationDate: getText('dc:modified') ? new Date(getText('dc:modified')!) : undefined,
    }
  } catch {
    // 메타데이터 파일 없거나 파싱 실패 시 기본값
    return {
      pageCount: 0,
      pages: [],
      fileSize,
    }
  }
}

/**
 * HWPX 본문 텍스트 추출 (Contents/section*.xml)
 * 한글 문서의 경우 <hp:p> (문단), <hp:t> (텍스트) 태그 사용
 */
async function extractHWPXText(extractedDir: string): Promise<ParsedPage[]> {
  const contentsDir = path.join(extractedDir, 'Contents')
  const pages: ParsedPage[] = []

  try {
    const files = await fs.readdir(contentsDir)
    const sectionFiles = files
      .filter(f => f.startsWith('section') && f.endsWith('.xml'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('section', '').replace('.xml', ''), 10)
        const numB = parseInt(b.replace('section', '').replace('.xml', ''), 10)
        return numA - numB
      })

    for (let i = 0; i < sectionFiles.length; i++) {
      const filePath = path.join(contentsDir, sectionFiles[i])
      const content = await fs.readFile(filePath, 'utf-8')
      const text = extractTextFromHWPXML(content)
      
      if (text.trim().length > 0) {
        pages.push({
          pageNumber: i + 1,
          text: text.trim()
        })
      }
    }

    // section 파일이 없으면 body.xml 등 다른 파일 시도
    if (pages.length === 0) {
      const bodyPath = path.join(contentsDir, 'body.xml')
      try {
        const content = await fs.readFile(bodyPath, 'utf-8')
        const text = extractTextFromHWPXML(content)
        if (text.trim().length > 0) {
          pages.push({ pageNumber: 1, text: text.trim() })
        }
      } catch {
        // body.xml도 없으면 전체 텍스트 추출 시도
      }
    }

    return pages
  } catch (error) {
    console.error('[HWPX Parser] 본문 추출 실패:', error)
    return []
  }
}

/**
 * HWPML XML에서 텍스트 추출
 * 주요 태그: hp:p (문단), hp:t (텍스트), hp:run (런)
 */
function extractTextFromHWPXML(xmlContent: string): string {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlContent, 'text/xml')

    // hp:t 태그에서 텍스트 추출 (가장 일반적인 텍스트 컨테이너)
    const textElements = doc.getElementsByTagName('hp:t')
    const texts: string[] = []

    for (let i = 0; i < textElements.length; i++) {
      const text = textElements[i].textContent?.trim()
      if (text) texts.push(text)
    }

    // hp:t가 없으면 hp:p (문단) 태그 시도
    if (texts.length === 0) {
      const paraElements = doc.getElementsByTagName('hp:p')
      for (let i = 0; i < paraElements.length; i++) {
        const text = paraElements[i].textContent?.trim()
        if (text) texts.push(text)
      }
    }

    // 그래도 없으면 모든 텍스트 노드 추출 (getElementsByTagName('*')로 전체 순회)
    if (texts.length === 0) {
      const allElements = doc.getElementsByTagName('*')
      for (let i = 0; i < allElements.length; i++) {
        const text = allElements[i].textContent?.trim()
        if (text && text.length > 1) {
          texts.push(text)
        }
      }
    }

    return texts.join('\n')
  } catch {
    // XML 파싱 실패 시 원본에서 태그 제거하여 텍스트만 추출
    return xmlContent
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
}

/**
 * HWPX 파일인지 확인 (매직 넘버 또는 확장자)
 */
export function isHWPXFile(filename: string, buffer?: Buffer): boolean {
  if (filename.toLowerCase().endsWith('.hwpx')) return true
  
  if (buffer && buffer.length >= 4) {
    // ZIP 매직 넘버: PK\x03\x04 또는 PK\x05\x06 또는 PK\x07\x08
    const signature = buffer.toString('hex', 0, 4).toUpperCase()
    return signature.startsWith('504B0304') || signature.startsWith('504B0506') || signature.startsWith('504B0708')
  }
  
  return false
}