'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Document {
  id: string
  title: string
  category: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  updated_at: string
  uploaded_by: string
  file_path: string
  profiles?: {
    email: string
  }
}

interface UploadFile {
  file: File
  category: string
  id: string
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
}

const STATUS_LABELS: Record<Document['status'], string> = {
  pending: '대기중',
  processing: '처리중',
  completed: '완료',
  failed: '실패',
}

const STATUS_COLORS: Record<Document['status'], string> = {
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/hwpx',
  'application/x-hwpx',
]

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.hwpx']

export function AdminDocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [showCategoryInput, setShowCategoryInput] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()

  // 토스트 표시
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 문서 목록 조회
  const fetchDocuments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          *,
          profiles:uploaded_by (email)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setDocuments(data || [])
      
      // 카테고리 목록 추출
      const uniqueCategories = [...new Set((data || []).map((d: Document) => d.category).filter(Boolean) as string[])]
      setCategories(uniqueCategories)
    } catch (error) {
      console.error('문서 조회 실패:', error)
      showToast('문서 목록을 불러오는데 실패했습니다', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [supabase, showToast])

  // 초기 로드 및 폴링 시작
  useEffect(() => {
    fetchDocuments()
    
    // 5초마다 폴링
    pollingIntervalRef.current = setInterval(fetchDocuments, 5000)
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [fetchDocuments])

  // 파일 검증
  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
      return '지원하지 않는 파일 형식입니다 (PDF, DOCX, HWPX만 가능)'
    }
    if (file.size > 50 * 1024 * 1024) {
      return '파일 크기는 50MB 이하여야 합니다'
    }
    return null
  }

  // 드롭 핸들러
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
    e.target.value = ''
  }

  const handleFiles = (files: File[]) => {
    const newFiles: UploadFile[] = files
      .filter(file => {
        const error = validateFile(file)
        if (error) {
          showToast(`${file.name}: ${error}`, 'error')
          return false
        }
        return true
      })
      .map(file => ({
        file,
        category: selectedCategory || newCategory,
        id: crypto.randomUUID(),
        progress: 0,
        status: 'pending' as const,
      }))
    
    if (newFiles.length > 0) {
      setUploadFiles(prev => [...prev, ...newFiles])
      uploadFilesBatch(newFiles)
    }
  }

  // 파일 업로드
  const uploadFilesBatch = async (files: UploadFile[]) => {
    for (const uploadFile of files) {
      // 상태 업데이트: uploading
      setUploadFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, status: 'uploading' as const } : f
      ))

      try {
        const formData = new FormData()
        formData.append('file', uploadFile.file)
        formData.append('title', uploadFile.file.name)
        formData.append('category', uploadFile.category || '')

        const response = await fetch('/api/process-document', {
          method: 'POST',
          body: formData,
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || '업로드 실패')
        }

        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { ...f, status: 'completed' as const, progress: 100 } : f
        ))

        showToast(`${uploadFile.file.name} 업로드 완료`, 'success')
        
        // 문서 목록 새로고침
        fetchDocuments()
      } catch (error) {
        console.error('업로드 실패:', error)
        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { 
            ...f, 
            status: 'error' as const, 
            error: error instanceof Error ? error.message : '업로드 실패' 
          } : f
        ))
        showToast(`${uploadFile.file.name} 업로드 실패`, 'error')
      }
    }
  }

  // 문서 삭제
  const handleDelete = async (document: Document) => {
    if (!confirm(`"${document.title}" 문서를 삭제하시겠습니까? 저장소 파일과 DB 데이터가 모두 삭제됩니다.`)) {
      return
    }

    try {
      // 1. Storage에서 파일 삭제
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([document.file_path])

      if (storageError) {
        console.warn('Storage 삭제 실패 (이미 삭제되었을 수 있음):', storageError)
      }

      // 2. DB에서 문서 삭제 (청크는 CASCADE로 자동 삭제)
      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', document.id)

      if (dbError) throw dbError

      showToast('문서가 삭제되었습니다', 'success')
      fetchDocuments()
    } catch (error) {
      console.error('삭제 실패:', error)
      showToast('문서 삭제에 실패했습니다', 'error')
    }
  }

  // 카테고리 추가
  const handleAddCategory = () => {
    const trimmed = newCategory.trim()
    if (trimmed && !categories.includes(trimmed)) {
      setCategories(prev => [...prev, trimmed])
      setSelectedCategory(trimmed)
      setNewCategory('')
      setShowCategoryInput(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getUploaderEmail = (doc: Document) => {
    return doc.profiles?.email || '알 수 없음'
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">문서 관리</h1>
            <nav className="flex items-center gap-4">
              <a
                href="/admin"
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors text-sm"
              >
                대시보드
              </a>
              <a
                href="/chat"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                챗봇 테스트
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 업로드 영역 */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">문서 업로드</h2>
          
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              dragActive 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              multiple
              accept=".pdf,.docx,.hwpx"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploadFiles.some(f => f.status === 'uploading')}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer"
            >
              <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                파일을 여기에 드래그하거나 <span className="text-blue-600 dark:text-blue-400 font-medium underline">클릭하여 선택</span>
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
                PDF, DOCX, HWPX 지원 (최대 50MB, 다중 선택 가능)
              </p>
            </label>
          </div>

          {/* 카테고리 선택 */}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">카테고리:</label>
            
            <div className="flex items-center gap-2">
              <select
                value={selectedCategory}
                onChange={e => { setSelectedCategory(e.target.value); setNewCategory(''); setShowCategoryInput(false); }}
                className="input flex-1 min-w-[200px] max-w-md"
              >
                <option value="">카테고리 선택 (선택사항)</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value="__new__">+ 새 카테고리 추가</option>
              </select>

              {showCategoryInput && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                    placeholder="새 카테고리명"
                    className="input flex-1 max-w-xs"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="btn btn-primary whitespace-nowrap"
                  >
                    추가
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCategoryInput(false); setNewCategory(''); }}
                    className="btn btn-secondary whitespace-nowrap"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 업로드 진행 현황 */}
          {uploadFiles.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">업로드 현황</h3>
              {uploadFiles.map(uf => (
                <div key={uf.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900 dark:text-white truncate max-w-[300px]">{uf.file.name}</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      uf.status === 'uploading' ? 'bg-blue-100 text-blue-700' :
                      uf.status === 'completed' ? 'bg-green-100 text-green-700' :
                      uf.status === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {uf.status === 'uploading' ? '업로드 중' :
                       uf.status === 'completed' ? '완료' :
                       uf.status === 'error' ? '실패' : '대기중'}
                    </span>
                  </div>
                  {uf.status === 'uploading' && (
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${uf.progress}%` }}
                      />
                    </div>
                  )}
                  {uf.status === 'error' && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{uf.error}</p>
                  )}
                  {uf.category && (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">카테고리: {uf.category}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 문서 목록 */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">문서 목록</h2>
            <button
              onClick={fetchDocuments}
              disabled={isLoading}
              className="btn btn-secondary text-sm"
            >
              <svg className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              새로고침
            </button>
          </div>

          {isLoading ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center">
              <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="mt-2 text-gray-500 dark:text-gray-400">문서 목록을 불러오는 중...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">등록된 문서가 없습니다</h3>
              <p className="mt-1 text-gray-500 dark:text-gray-400">위 업로드 영역에서 문서를 추가해 주세요</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">제목</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">카테고리</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">상태</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">업로드일</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">업로더</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {documents.map(doc => (
                      <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs" title={doc.title}>
                            {doc.title}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {doc.file_path}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {doc.category ? (
                            <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                              {doc.category}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[doc.status]}`}>
                            {STATUS_LABELS[doc.status]}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {getUploaderEmail(doc)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => handleDelete(doc)}
                            disabled={doc.status === 'processing'}
                            className="btn btn-danger text-sm px-3 py-1.5 opacity-100 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 text-right">
                총 {documents.length}개 문서 · 5초마다 자동 새로고침
              </div>
            </div>
          )}
        </section>
      </main>

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[280px] ${
            toast.type === 'success' 
              ? 'bg-green-600 text-white' 
              : 'bg-red-600 text-white'
          }`}>
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              {toast.type === 'success' ? (
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              )}
            </svg>
            <span className="text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
        .input {
          @apply w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all;
        }
        .btn {
          @apply inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed;
        }
        .btn-primary {
          @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
        }
        .btn-secondary {
          @apply bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 focus:ring-gray-500;
        }
        .btn-danger {
          @apply bg-red-600 text-white hover:bg-red-700 focus:ring-red-500;
        }
      `}</style>
    </div>
  )
}