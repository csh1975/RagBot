'use client'

/**
 * AI SDK v5의 source-document 파트에서 추출한 출처 정보 타입.
 * 서버는 providerMetadata에 chunkId/documentId/pageNumber/similarity/preview를 담아 보낸다.
 */
export interface SourceLike {
  sourceId: string
  title: string
  providerMetadata?: {
    chunkId?: string
    documentId?: string
    pageNumber?: number | null
    similarity?: number
    preview?: string
  }
}

interface SourceCitationsProps {
  sources: SourceLike[]
  onClose: () => void
}

export function SourceCitations({ sources, onClose }: SourceCitationsProps) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            참고 문서 ({sources.length})
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm px-2 py-1"
            aria-label="출처 닫기"
          >
            닫기
          </button>
        </div>

        <ul className="space-y-2">
          {sources.map((source, index) => {
            const meta = source.providerMetadata
            const pageText = meta?.pageNumber ? ` p.${meta.pageNumber}` : ''
            const similarityPercent =
              typeof meta?.similarity === 'number'
                ? `${Math.round(meta.similarity * 100)}%`
                : ''

            return (
              <li
                key={source.sourceId}
                className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700"
              >
                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-white break-all">
                      {source.title}
                    </span>
                    {pageText && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{pageText}</span>
                    )}
                    {similarityPercent && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        유사도 {similarityPercent}
                      </span>
                    )}
                  </div>
                  {meta?.preview && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                      {meta.preview}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
