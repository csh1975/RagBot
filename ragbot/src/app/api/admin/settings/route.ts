import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 30

const SENSITIVE_KEYS = ['gemini_api_key']

function maskValue(key: string, value: string): string {
  if (SENSITIVE_KEYS.includes(key)) {
    if (!value || value === '""') return ''
    return '••••••••'
  }
  return value
}

export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value, description, is_secret')

    if (error) throw error

    const settings = (data || []).map(row => ({
      key: row.key,
      value: row.is_secret ? maskValue(row.key, row.value) : row.value,
      description: row.description,
      is_secret: row.is_secret,
    }))

    return NextResponse.json({ success: true, data: settings })
  } catch (error) {
    console.error('[Admin Settings] GET error:', error)
    return NextResponse.json(
      { success: false, error: '설정 조회 실패' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient()

    const { key, value } = await request.json()

    if (!key || value === undefined) {
      return NextResponse.json(
        { success: false, error: 'key와 value는 필수입니다' },
        { status: 400 }
      )
    }

    const { data: existing } = await supabase
      .from('app_settings')
      .select('is_secret')
      .eq('key', key)
      .single()

    const isSecret = existing?.is_secret ?? SENSITIVE_KEYS.includes(key)
    const valueJson = typeof value === 'string' ? value : JSON.stringify(value)

    const { error } = await supabase
      .from('app_settings')
      .upsert({
        key,
        value: valueJson,
        is_secret: isSecret,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    if (error) throw error

    if (key === 'gemini_api_key') {
      // 환경변수 캐시 무효화 (다음 요청부터 새 키 사용)
      // Node.js에서는 process.env는 읽기 전용이므로 실제 적용은 재시작 필요
      console.log('[Admin Settings] GEMINI_API_KEY 업데이트�� - 서버 재시작 필요')
    }

    return NextResponse.json({ success: true, data: { key, updated: true } })
  } catch (error) {
    console.error('[Admin Settings] POST error:', error)
    return NextResponse.json(
      { success: false, error: '설정 저장 실패' },
      { status: 500 }
    )
  }
}