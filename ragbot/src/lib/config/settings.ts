import { createServiceClient } from '@/lib/supabase/server'

let _settingsCache: Record<string, string> | null = null
let _cacheTime = 0
const CACHE_TTL_MS = 60_000

export async function getAppSettings(): Promise<Record<string, string>> {
  const now = Date.now()
  if (_settingsCache && now - _cacheTime < CACHE_TTL_MS) {
    return _settingsCache
  }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')

    if (error) throw error

    const settings: Record<string, string> = {}
    for (const row of data || []) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }

    _settingsCache = settings
    _cacheTime = now
    return settings
  } catch (error) {
    console.error('[Settings] 설정 로드 실패:', error)
    return {}
  }
}

export async function getSetting(key: string): Promise<string | undefined> {
  const settings = await getAppSettings()
  return settings[key]
}

export function getEnvOrSetting(key: string): string | undefined {
  const envValue = process.env[key]
  if (envValue) return envValue

  // 개발 환경에서만 캐시된 설정 사용 (서버리스에서는 process.env가 우선)
  if (process.env.NODE_ENV !== 'production') {
    return _settingsCache?.[key]
  }
  return undefined
}

export function clearSettingsCache() {
  _settingsCache = null
  _cacheTime = 0
}