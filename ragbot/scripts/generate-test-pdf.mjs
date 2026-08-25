/**
 * 한글 테스트 PDF 생성 스크립트 (E2E 검증용)
 * - 대전교육연수원 문서 기반 RAG 테스트용
 * - pdfkit으로 Malgun Gothic 폰트를 임베딩해 페이지별 텍스트가 정상 추출되도록 함
 *
 * 사용: node scripts/generate-test-pdf.mjs
 */

import PDFDocument from 'pdfkit'
import fs from 'fs'

const FONT_PATH = 'C:/Windows/Fonts/malgun.ttf'
const OUTPUT = 'test-document.pdf'

const doc = new PDFDocument({ size: 'A4', margin: 72 })
doc.pipe(fs.createWriteStream(OUTPUT))
doc.font(FONT_PATH)

// ---------- 1 페이지 ----------
doc.fontSize(20).text('대전교육연수원 연수 운영 지침', { align: 'center' })
doc.moveDown()
doc.fontSize(12)
doc.text('제1장 총칙')
doc.text('제1조(목적) 이 지침은 대전교육연수원에서 운영하는 각종 연수 프로그램의 신청, 운영, 평가에 관한 사항을 규정함을 목적으로 한다.')
doc.text('제2조(적용 범위) 이 지침은 대전교육연수원이 주관하는 직무연수, 자격연수, 원격연수 등 모든 연수 과정에 적용한다.')
doc.moveDown()
doc.text('제3조(연수 대상자) 연수 대상자는 대전광역시 관내 초·중·고등학교에 재직 중인 교원 및 교육전문직원으로 한다.')
doc.text('연수 대상자는 각 연수 과정별 신청 기간 내에 온라인 연수 신청 시스템을 통해 신청하여야 한다.')
doc.moveDown()
doc.text('제4조(연수 종류) 연수는 다음 각 호의 종류로 구분한다.')
doc.text('1. 직무연수: 교원의 전문성 신장을 위한 연수')
doc.text('2. 자격연수: 특정 자격 취득을 위한 연수')
doc.text('3. 원격연수: 인터넷 기반으로 진행되는 연수')

// ---------- 2 페이지 ----------
doc.addPage()
doc.fontSize(20).text('제2장 연수 신청 및 운영', { align: 'center' })
doc.moveDown()
doc.fontSize(12)
doc.text('제5조(신청 절차) 연수 신청은 아래 절차에 따라 진행한다.')
doc.text('1. 연수원 홈페이지에서 연수 과정을 확인한다.')
doc.text('2. 신청 기간 내에 온라인으로 신청한다.')
doc.text('3. 정원 초과 시 추첨 또는 선착순으로 선발한다.')
doc.text('4. 선발 결과는 개별 문자와 이메일로 안내한다.')
doc.moveDown()
doc.text('제6조(정원) 각 연수 과정의 정원은 과정별로 상이하며, 통상 30명 이상 60명 이하로 한다.')
doc.text('교육청 지정 필수 연수는 100명까지 확대 운영할 수 있다.')
doc.moveDown()
doc.text('제7조(연수 시간) 연수 시간은 과정에 따라 15시간, 30시간, 60시간 과정으로 나뉜다.')
doc.text('1. 15시간 과정: 2일 이내 집합 연수')
doc.text('2. 30시간 과정: 4일 이내 집합 연수 또는 2주 이내 원격 연수')
doc.text('3. 60시간 과정: 6주 이내 원격 연수 중심')
doc.text('모든 과정은 1일 최대 8시간을 초과할 수 없다.')

// ---------- 3 페이지 ----------
doc.addPage()
doc.fontSize(20).text('제3장 평가 및 수료', { align: 'center' })
doc.moveDown()
doc.fontSize(12)
doc.text('제8조(평가 방법) 연수 이수 평가는 아래의 방법으로 실시한다.')
doc.text('1. 집합 연수: 출석률 80% 이상 및 과제 제출')
doc.text('2. 원격 연수: 학습 진도율 100% 및 온라인 평가 60점 이상')
doc.text('3. 자격 연수: 필기 시험 60점 이상')
doc.moveDown()
doc.text('제9조(수료 기준) 다음 각 호의 요건을 모두 충족한 자에게 수료증을 발급한다.')
doc.text('1. 출석률이 전체 연수 시간의 80% 이상인 자')
doc.text('2. 평가 점수가 60점 이상인 자')
doc.text('3. 연수비를 완납한 자')
doc.moveDown()
doc.text('제10조(이의 신청) 수료 결과에 이의가 있는 자는 결과 통보일로부터 7일 이내에 연수원에 이의를 신청할 수 있다.')
doc.text('연수원은 이의 신청 접수일로부터 10일 이내에 재심사 결과를 통보하여야 한다.')
doc.moveDown()
doc.text('부칙 이 지침은 2024년 1월 1일부터 시행한다.')

doc.end()
console.log(`테스트 PDF 생성 완료: ${OUTPUT}`)
