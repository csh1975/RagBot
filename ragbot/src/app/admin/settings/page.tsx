'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Setting {
  key: string
  value: string
  description: string
  is_secret: boolean
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const checkAuth = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/auth/login?redirectTo=/admin/settings')
      return
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      router.push('/chat')
    }
  }, [router])

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings')
      const json = await res.json()
      if (json.success) {
        setSettings(json.data)
      } else {
        showToast('설정 불러오기 실패', 'error')
      }
    } catch {
      showToast('설정 불러오기 실패', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSettings()
    checkAuth()
  }, [fetchSettings, checkAuth])

  async function handleSave(key: string, value: string) {
    setSaving(key)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      const json = await res.json()
      if (json.success) {
        showToast(`${key} 저장 완료`, 'success')
        if (key === 'gemini_api_key') {
          showToast('API 키 변경 시 서버 재시작 필요 (Vercel: 환경변수 업데이트 후 재배포)', 'success')
        }
      } else {
        showToast(json.error || '저장 실패', 'error')
      }
    } catch {
      showToast('저장 실패', 'error')
    } finally {
      setSaving(null)
    }
  }

  function handleInputChange(key: string, e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const newValue = e.target.value
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value: newValue } : s))
  }

const settingConfigs: Array<{
    key: string
    label: string
    type: 'password' | 'select' | 'number'
    placeholder?: string
    options?: Array<{ value: string; label: string }>
    description: string
    is_secret?: boolean
  }> = [
    {
      key: 'llm_provider',
      label: 'LLM 프로바이더',
      type: 'select' as const,
      options: [
        { value: 'gemini', label: 'Gemini (Google)' },
        { value: 'anthropic', label: 'Anthropic (Claude)' },
        { value: 'openai', label: 'OpenAI (GPT)' },
        { value: 'custom', label: 'Custom (OpenAI 호환/로컬 LLM)' },
      ],
      description: 'LLM 응답 생성에 사용할 프로바이더 (변경 시 서버 재시작 필요)',
    },
    {
      key: 'gemini_api_key',
      label: 'Gemini API Key',
      type: 'password' as const,
      placeholder: 'AIza... (Google AI Studio에서 발급)',
      description: '임베딩(gemini-embedding-001)과 챗(gemini-2.5-flash)에 사용됩니다. 무료 티어 제공.',
      is_secret: true,
    },
    {
      key: 'llm_api_key',
      label: 'LLM API Key',
      type: 'password' as const,
      placeholder: 'sk-... (Anthropic/OpenAI/Custom API 키)',
      description: '선택한 LLM 프로바이더의 API 키 (Gemini 외 프로바이더 사용 시 필요)',
      is_secret: true,
    },
    {
      key: 'llm_base_url',
      label: 'LLM Base URL (선택)',
      type: 'password' as const,
      placeholder: 'http://localhost:11434/v1 (Ollama 등 커스텀 엔드포인트)',
      description: 'Custom 프로바이더 사용 시 OpenAI 호환 API 엔드포인트',
      is_secret: false,
    },
    {
      key: 'embedding_model',
      label: '임베딩 모델',
      type: 'select' as const,
      options: [
        { value: 'gemini-embedding-001', label: 'gemini-embedding-001 (3072차원, 무료)' },
      ],
      description: '변경 시 기존 임베딩과 호환되지 않으므로 문서 재처리 필요',
    },
    {
      key: 'embedding_dimension',
      label: '임베딩 차원',
      type: 'number' as const,
      placeholder: '3072',
      description: '모델과 일치해야 함 (gemini-embedding-001: 3072)',
    },
    {
      key: 'llm_model',
      label: 'LLM 모델',
      type: 'select' as const,
      options: [
        { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Gemini, 빠름, 무료)' },
        { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro (Gemini, 고성능, 무료 한도 내)' },
        { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite (Gemini, 경량, 무료)' },
        { value: 'gemini-flash-latest', label: 'gemini-flash-latest (Gemini, 최신, 무료)' },
        { value: 'gemini-flash-lite-latest', label: 'gemini-flash-lite-latest (Gemini, 경량 최신, 무료)' },
        { value: 'gemini-pro-latest', label: 'gemini-pro-latest (Gemini, 고성능, 무료)' },
        { value: 'gemini-2.5-flash-image', label: 'gemini-2.5-flash-image (Gemini, 이미지 생성)' },
        { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 (Anthropic, 고성능)' },
        { value: 'claude-3-5-sonnet-20241022', label: 'claude-3-5-sonnet (Anthropic)' },
        { value: 'gpt-4o', label: 'gpt-4o (OpenAI, 고성능)' },
        { value: 'gpt-4o-mini', label: 'gpt-4o-mini (OpenAI, 빠름, 저렴)' },
        { value: 'llama3.1', label: 'llama3.1 (Custom/Ollama, 로컬)' },
        { value: 'mistral', label: 'mistral (Custom/Ollama, 로컬)' },
      ],
      description: '선택한 프로바이더에 맞는 모델명 입력 (Custom 프로바이더는 직접 입력)',
    },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/admin/documents" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              ← 문서 관리
            </a>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">시스템 설정</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {toast && (
          <div className={`mb-6 p-4 rounded-lg text-sm ${
            toast.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}>
            {toast.message}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">LLM 및 임베딩 설정</h2>

          <div className="space-y-6">
            {settingConfigs.map(config => {
              const setting = settings.find(s => s.key === config.key)
              const currentValue = setting?.value || ''

              return (
                <div key={config.key} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {config.label}
                  </label>

                  {config.type === 'select' && (
                    <select
                      value={currentValue}
                      onChange={e => handleInputChange(config.key, e)}
                      className="input w-full max-w-md"
                      disabled={saving === config.key}
                    >
                      {config.options!.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  )}

                  {config.type === 'password' && (
                    <div className="relative">
                      <input
                        type="password"
                        value={currentValue}
                        onChange={e => handleInputChange(config.key, e)}
                        placeholder={config.placeholder}
                        className="input w-full max-w-md pr-12"
                        disabled={saving === config.key}
                        autoComplete="off"
                      />
                      {currentValue && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400">
                          {config.is_secret ? '•••••••• (마스����)' : currentValue}
                        </span>
                      )}
                    </div>
                  )}

                  {config.type === 'number' && (
                    <input
                      type="number"
                      value={currentValue}
                      onChange={e => handleInputChange(config.key, e)}
                      placeholder={config.placeholder}
                      className="input w-full max-w-xs"
                      disabled={saving === config.key}
                    />
                  )}

                  <p className="text-sm text-gray-500 dark:text-gray-400">{config.description}</p>

                  <button
                    onClick={() => handleSave(config.key, currentValue)}
                    disabled={saving === config.key || !String(currentValue).trim()}
                    className="btn btn-primary"
                  >
                    {saving === config.key ? '저장 중...' : '저장'}
                  </button>
                </div>
              )
            })}

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">현재 LLM 프로바이더: {process.env.LLM_PROVIDER || 'gemini'}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                LLM_PROVIDER 환경변수로 프로바이더를 선택합니다 (anthropic, openai, custom, gemini).
                <br />
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                  Google AI Studio에서 API 키 발급받기 (Gemini용)
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}